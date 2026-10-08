import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paysDepuisFuseau, paysPossiblesDuFuseau } from './fuseaux-pays.config';

test('Africa/Lagos est ambigu et ne donne pas de pays à lui seul', () => {
  assert.equal(paysDepuisFuseau('Africa/Lagos'), null);
  assert.ok(paysPossiblesDuFuseau('Africa/Lagos')?.includes('GA'));
  assert.equal(paysPossiblesDuFuseau('Africa/Libreville'), null);
});

test('paysDepuisFuseau reconnaît les fuseaux connus', () => {
  assert.equal(paysDepuisFuseau('Africa/Libreville'), 'GA');
  assert.equal(paysDepuisFuseau(' Europe/Paris '), 'FR');
  assert.equal(paysDepuisFuseau('America/Chicago'), 'US');
});

test('paysDepuisFuseau renvoie null pour un fuseau inconnu ou vide', () => {
  assert.equal(paysDepuisFuseau('Asia/Tokyo'), null);
  assert.equal(paysDepuisFuseau(''), null);
  assert.equal(paysDepuisFuseau(undefined), null);
  assert.equal(paysDepuisFuseau(null), null);
});
