const DAILY_LIMIT = 5;
const MAX_TEXT_LENGTH = 4000;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-kairos-owner',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function validateBody(body) {
  if (!body || (body.mode !== 'translate' && body.mode !== 'term')) {
    throw new Error('Выберите режим перевода или объяснения термина');
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new Error('Введите текст');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Текст не должен превышать 4 000 символов');
  const installationId = typeof body.installationId === 'string' ? body.installationId.trim() : '';
  if (!/^[A-Za-z0-9-]{8,128}$/.test(installationId)) {
    throw new Error('Не удалось определить установку приложения');
  }
  return { mode: body.mode, text, installationId };
}

function validateTelemetry(body) {
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const version = typeof body?.version === 'string' ? body.version.trim() : '';
  if (!/^[A-Za-z0-9-]{8,128}$/.test(installationId) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Некорректные данные установки');
  }
  return { installationId, version };
}

function promptFor(mode, text) {
  if (mode === 'translate') {
    const target = /[А-Яа-яЁё]/.test(text) ? 'English' : 'Russian';
    return {
      instructions: [
        `Translate the user's text into ${target}.`,
        'Return only the translation, without commentary or quotation marks.',
        'Preserve product names, URLs, commands, code fragments, formatting, and intended tone.',
      ].join(' '),
      input: text,
    };
  }
  return {
    instructions: [
      'Объясни указанный IT-термин на максимально простом русском языке человеку без опыта в IT.',
      'Не используй непояснённый технический жаргон.',
      'Ответ дай строго в трёх коротких разделах: «Что это», «Пример из жизни», «Зачем используется».',
      'Если введено не название термина, вежливо попроси ввести один IT-термин.',
    ].join(' '),
    input: text,
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function readOutput(payload) {
  const chatContent = payload?.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string' && chatContent.trim()) return chatContent.trim();
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return '';
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  const url = new URL(request.url);
  const suppliedOwnerToken = request.headers.get('x-kairos-owner') || '';
  const isOwner = Boolean(env.OWNER_TOKEN) && suppliedOwnerToken === env.OWNER_TOKEN;

  if (request.method === 'POST' && url.pathname === '/v1/telemetry') {
    if (!env.DB || !env.TELEMETRY_SALT) return new Response(null, { status: 204, headers: JSON_HEADERS });
    let telemetry;
    try {
      telemetry = validateTelemetry(await request.json());
    } catch (error) {
      return json({ error: 'invalid_request', message: error.message }, 400);
    }
    const installationHash = await sha256(`${env.TELEMETRY_SALT}:${telemetry.installationId}`);
    await env.DB.prepare(`
      INSERT INTO installations (installation_hash, first_seen, last_seen, first_version, current_version)
      VALUES (?1, datetime('now'), datetime('now'), ?2, ?2)
      ON CONFLICT(installation_hash) DO UPDATE SET
        last_seen = datetime('now'),
        current_version = excluded.current_version
    `).bind(installationHash, telemetry.version).run();
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (request.method === 'GET' && url.pathname === '/v1/stats') {
    if (!isOwner || !env.DB) return json({ error: 'not_found', message: 'Маршрут не найден' }, 404);
    const totals = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN first_seen >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS newToday,
        SUM(CASE WHEN first_seen >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS new7Days,
        SUM(CASE WHEN first_seen >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS new30Days,
        SUM(CASE WHEN last_seen >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS active30Days
      FROM installations
    `).first();
    const versions = await env.DB.prepare(`
      SELECT current_version AS version, COUNT(*) AS count
      FROM installations
      GROUP BY current_version
      ORDER BY count DESC, current_version DESC
    `).all();
    return json({
      total: Number(totals?.total || 0),
      newToday: Number(totals?.newToday || 0),
      new7Days: Number(totals?.new7Days || 0),
      new30Days: Number(totals?.new30Days || 0),
      active30Days: Number(totals?.active30Days || 0),
      versions: (versions.results || []).map(row => ({ version: row.version, count: Number(row.count) })),
    });
  }

  if (request.method !== 'POST' || url.pathname !== '/v1/assistant') {
    return json({ error: 'not_found', message: 'Маршрут не найден' }, 404);
  }
  if (!env.OPENAI_API_KEY || !env.QUOTA) {
    return json({ error: 'not_configured', message: 'AI-сервис временно не настроен' }, 503);
  }

  let input;
  try {
    input = validateBody(await request.json());
  } catch (error) {
    return json({ error: 'invalid_request', message: error.message || 'Некорректный запрос' }, 400);
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const identity = await sha256(`${input.installationId}:${ip}`);
  const quotaKey = `quota:${dateKey}:${identity}`;
  const used = isOwner ? 0 : Number(await env.QUOTA.get(quotaKey) || 0);

  if (!isOwner && used >= DAILY_LIMIT) {
    return json({
      error: 'daily_limit',
      message: 'Сегодня использованы все 5 запросов. Лимит обновится завтра.',
      remaining: 0,
    }, 429);
  }

  const prompt = promptFor(input.mode, input.text);
  const providerFetch = env.OPENAI_FETCH || fetch;
  let providerResponse;
  try {
    providerResponse = await providerFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: new TextEncoder().encode(JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-5.4-nano',
        messages: [
          { role: 'system', content: prompt.instructions },
          { role: 'user', content: prompt.input },
        ],
        max_completion_tokens: input.mode === 'translate' ? 600 : 800,
      })),
    });
  } catch (_) {
    return json({ error: 'network_error', message: 'Не удалось связаться с AI-сервисом' }, 502);
  }

  if (!providerResponse.ok) {
    const providerBody = await providerResponse.text();
    let providerError = {};
    try { providerError = JSON.parse(providerBody); } catch (_) {}
    const providerMessage = providerError?.error?.message || 'Unknown provider error';
    console.error('OpenAI request failed', providerResponse.status, providerMessage);
    return json({
      error: 'provider_error',
      message: 'AI-сервис временно не ответил. Попробуйте позже.',
    }, 502);
  }

  const result = readOutput(await providerResponse.json());
  if (!result) return json({ error: 'empty_response', message: 'AI вернул пустой ответ' }, 502);

  if (!isOwner) {
    await env.QUOTA.put(quotaKey, String(used + 1), { expirationTtl: 172800 });
  }
  return json({
    result,
    remaining: isOwner ? null : DAILY_LIMIT - used - 1,
    unlimited: isOwner,
  });
}

export { DAILY_LIMIT, handleRequest, promptFor, readOutput, validateBody, validateTelemetry };
export default { fetch: handleRequest };
