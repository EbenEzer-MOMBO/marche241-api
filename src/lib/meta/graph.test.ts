import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGraphBody, graphErrorMessage, graphUrl, isGraphWriteSuccess } from './graph';

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
