import test from 'node:test';
import assert from 'node:assert/strict';

import { handleRequest } from '../worker/worker.mjs';

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? String(this.values.get(key)) : null; }
  async put(key, value) { this.values.set(key, Number(value)); }
}

class FakeD1 {
  constructor() { this.installations = new Map(); }
  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          const [hash, version] = values;
          const existing = this.installations.get(hash);
          this.installations.set(hash, existing
            ? { ...existing, current_version: version, last_seen: new Date().toISOString() }
            : { installation_hash: hash, first_version: version, current_version: version, first_seen: new Date().toISOString(), last_seen: new Date().toISOString() });
          return { success: true };
        },
      }),
      first: async () => {
        const rows = [...this.installations.values()];
        return { total: rows.length, newToday: rows.length, new7Days: rows.length, new30Days: rows.length, active30Days: rows.length };
      },
      all: async () => {
        const counts = new Map();
        for (const row of this.installations.values()) counts.set(row.current_version, (counts.get(row.current_version) || 0) + 1);
        return { results: [...counts].map(([version, count]) => ({ version, count })) };
      },
    };
  }
}

function request(body, headers = {}) {
  return new Request('https://kairos.example/v1/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1', ...headers },
    body: JSON.stringify(body),
  });
}

function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://kairos.example${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function env(overrides = {}) {
  return {
    OPENAI_API_KEY: 'test-key',
    OWNER_TOKEN: 'owner-secret',
    OPENAI_MODEL: 'gpt-5.4-nano',
    QUOTA: new FakeKV(),
    DB: new FakeD1(),
    TELEMETRY_SALT: 'telemetry-test-salt',
    OPENAI_FETCH: async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Готовый ответ' } }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    ...overrides,
  };
}

test('returns provider result and decrements external quota', async () => {
  const response = await handleRequest(request({
    mode: 'translate', text: 'Привет', installationId: 'install-1',
  }), env());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    result: 'Готовый ответ', remaining: 4, unlimited: false,
  });
});

test('records one unique installation and updates its version without incrementing total', async () => {
  const testEnv = env();
  for (const version of ['1.2.0', '1.2.1']) {
    const response = await handleRequest(apiRequest('/v1/telemetry', {
      method: 'POST', body: { installationId: 'install-unique', version },
    }), testEnv);
    assert.equal(response.status, 204);
  }
  assert.equal(testEnv.DB.installations.size, 1);
  assert.equal([...testEnv.DB.installations.values()][0].current_version, '1.2.1');
});

test('returns aggregate installation stats only to the owner', async () => {
  const testEnv = env();
  await handleRequest(apiRequest('/v1/telemetry', {
    method: 'POST', body: { installationId: 'install-stats', version: '1.2.0' },
  }), testEnv);
  const hidden = await handleRequest(apiRequest('/v1/stats'), testEnv);
  assert.equal(hidden.status, 404);
  const response = await handleRequest(apiRequest('/v1/stats', {
    headers: { 'x-kairos-owner': 'owner-secret' },
  }), testEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    total: 1, newToday: 1, new7Days: 1, new30Days: 1, active30Days: 1,
    versions: [{ version: '1.2.0', count: 1 }],
  });
});

test('blocks the sixth successful external request', async () => {
  const testEnv = env();
  for (let index = 0; index < 5; index += 1) {
    const response = await handleRequest(request({
      mode: 'term', text: 'API', installationId: 'install-2',
    }), testEnv);
    assert.equal(response.status, 200);
  }
  const blocked = await handleRequest(request({
    mode: 'term', text: 'Docker', installationId: 'install-2',
  }), testEnv);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'daily_limit');
});

test('owner token bypasses quota and reports unlimited access', async () => {
  const testEnv = env();
  for (let index = 0; index < 7; index += 1) {
    const response = await handleRequest(request({
      mode: 'term', text: 'Backend', installationId: 'owner-install',
    }, { 'x-kairos-owner': 'owner-secret' }), testEnv);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).unlimited, true);
  }
});

test('does not consume quota when OpenAI fails', async () => {
  const testEnv = env({
    OPENAI_FETCH: async () => new Response('{"error":"upstream"}', { status: 500 }),
  });
  const failed = await handleRequest(request({
    mode: 'translate', text: 'Hello', installationId: 'install-3',
  }), testEnv);
  assert.equal(failed.status, 502);
  assert.equal(testEnv.QUOTA.values.size, 0);
});
