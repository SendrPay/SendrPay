import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Bot, webhookCallback } from 'grammy';

const secret = 'test-secret';

function buildApp() {
  const bot = new Bot('123:ABC', {
    botInfo: {
      id: 0,
      is_bot: true,
      first_name: 'test',
      username: 'test_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    },
    client: {
      fetch: async () => new Response('{}', { status: 200 }),
    },
  });
  const app = Fastify({ logger: false });
  app.get('/healthz', async () => ({ ok: true }));
  app.post(`/telegram/${secret}`, webhookCallback(bot, 'fastify'));
  return app;
}

test('GET /healthz returns ok', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  await app.close();
});

test('POST /telegram/<secret> returns 200', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'POST',
    url: `/telegram/${secret}`,
    payload: { update_id: 1 },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

