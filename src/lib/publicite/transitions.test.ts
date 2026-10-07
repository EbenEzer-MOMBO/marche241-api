import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peutTransitionner, statutApresValidation, TRANSITIONS_PUBLICITE, verifierTransition } from './transitions';

test('parcours vendeur autorisé', () => {
  assert.ok(peutTransitionner('brouillon', 'en_attente_paiement'));
  assert.ok(peutTransitionner('en_attente_paiement', 'en_attente_validation'));
  assert.ok(peutTransitionner('en_attente_validation', 'programmee'));
  assert.ok(peutTransitionner('programmee', 'active'));
  assert.ok(peutTransitionner('active', 'terminee'));
});

test('retour en brouillon possible avant paiement seulement', () => {
  assert.ok(peutTransitionner('en_attente_paiement', 'brouillon'));
  assert.equal(peutTransitionner('en_attente_validation', 'brouillon'), false);
});

test('refusée et annulée sans sortie ; terminée seulement prolongée', () => {
  assert.deepEqual(TRANSITIONS_PUBLICITE.refusee, []);
  assert.deepEqual(TRANSITIONS_PUBLICITE.annulee, []);
  assert.deepEqual(TRANSITIONS_PUBLICITE.terminee, ['programmee', 'active']);
});

test('transitions interdites levées', () => {
  assert.throws(() => verifierTransition('brouillon', 'active'));
  assert.throws(() => verifierTransition('refusee', 'active'));
  assert.doesNotThrow(() => verifierTransition('active', 'annulee'));
});

test('statut après validation selon la date de début', () => {
  const maintenant = new Date('2026-10-07T12:00:00Z');
  assert.equal(statutApresValidation(new Date('2026-10-11T23:00:00Z'), maintenant), 'programmee');
  assert.equal(statutApresValidation(new Date('2026-10-04T23:00:00Z'), maintenant), 'active');
});
