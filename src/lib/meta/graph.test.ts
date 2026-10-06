import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appSecretProof,
  encodeGraphBody,
  graphErrorMessage,
  graphUrl,
  isGraphWriteSuccess,
  META_GRAPH_VERSION,
  metaGraphGet,
  metaGraphPost
} from './graph';

test('encodeGraphBody sérialise les objets en JSON et ignore null/undefined', () => {
  const params = encodeGraphBody({ name: 'x', budget: 1000, active: true, targeting: { a: 1 }, vide: null, absent: undefined });
  assert.equal(params.get('name'), 'x');
  assert.equal(params.get('budget'), '1000');
  assert.equal(params.get('active'), 'true');
  assert.equal(params.get('targeting'), '{"a":1}');
  assert.equal(params.has('vide'), false);
  assert.equal(params.has('absent'), false);
});

test('isGraphWriteSuccess accepte id ou success', () => {
  assert.equal(isGraphWriteSuccess({ id: '123' }), true);
  assert.equal(isGraphWriteSuccess({ success: true }), true);
  assert.equal(isGraphWriteSuccess({}), false);
  assert.equal(isGraphWriteSuccess({ success: false }), false);
});

test('graphErrorMessage privilégie error_user_msg', () => {
  assert.equal(graphErrorMessage({ error: { message: 'tech', error_user_msg: 'lisible' } }, 'f'), 'lisible');
  assert.equal(graphErrorMessage({ error: { message: 'tech' } }, 'f'), 'tech');
  assert.equal(graphErrorMessage(null, 'f'), 'f');
});

test('graphUrl construit une URL versionnée', () => {
  assert.equal(graphUrl('/act_1/campaigns', 'v21.0'), 'https://graph.facebook.com/v21.0/act_1/campaigns');
});

test('appSecretProof : HMAC-SHA256 hexadécimal (vecteur connu)', () => {
  assert.equal(
    appSecretProof('The quick brown fox jumps over the lazy dog', 'key'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
  );
});

const fetchInitial = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchInitial;
});

test('appsecret_proof et version figée ajoutés aux appels quand le secret est fourni', async () => {
  const urls: string[] = [];
  const corps: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    urls.push(String(input));
    corps.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ id: '1' }), { status: 200 });
  }) as typeof fetch;
  await metaGraphGet('act_1', { fields: 'name' }, 'jeton', { appSecret: 'secret' });
  await metaGraphPost('act_1/campaigns', { name: 'x' }, 'jeton', { appSecret: 'secret' });
  await metaGraphGet('me', {}, 'jeton');
  const get = new URL(urls[0]);
  assert.equal(get.pathname, `/${META_GRAPH_VERSION}/act_1`);
  assert.equal(get.searchParams.get('appsecret_proof'), appSecretProof('jeton', 'secret'));
  assert.equal(new URLSearchParams(corps[1]).get('appsecret_proof'), appSecretProof('jeton', 'secret'));
  assert.equal(new URL(urls[2]).searchParams.has('appsecret_proof'), false);
});
