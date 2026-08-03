import test from 'node:test';
import assert from 'node:assert/strict';

import { handleRequest } from '../worker/worker.mjs';

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? String(this.values.get(key)) : null; }
  async put(key, value) { this.values.set(key, Number(value)); }
}

function request(body, headers = {}) {
  return new Request('https://kairos.example/v1/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1', ...headers },
    body: JSON.stringify(body),
  });
}

function env(overrides = {}) {
  return {
    OPENAI_API_KEY: 'test-key',
    OWNER_TOKEN: 'owner-secret',
    OPENAI_MODEL: 'gpt-5.4-nano',
    QUOTA: new FakeKV(),
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
