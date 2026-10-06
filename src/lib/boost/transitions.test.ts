import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peutTransitionner, TRANSITIONS_BOOST, verifierTransition } from './transitions';
import { StatutBoost } from '../database-types';

test('parcours nominal', () => {
  const parcours: StatutBoost[] = ['brouillon', 'en_attente_paiement', 'en_attente_validation', 'actif', 'en_pause', 'actif', 'termine'];
  for (let i = 1; i < parcours.length; i++) {
    assert.ok(peutTransitionner(parcours[i - 1], parcours[i]), `${parcours[i - 1]} -> ${parcours[i]}`);
  }
});

test('transitions interdites', () => {
  assert.equal(peutTransitionner('brouillon', 'actif'), false);
  assert.equal(peutTransitionner('en_attente_paiement', 'actif'), false);
  assert.equal(peutTransitionner('termine', 'actif'), false);
  assert.equal(peutTransitionner('refuse', 'en_attente_validation'), false);
  assert.throws(() => verifierTransition('termine', 'actif'), /termine → actif/);
});

test('statuts finaux sans sortie', () => {
  for (const s of ['refuse', 'termine', 'rejete_meta'] as StatutBoost[]) assert.deepEqual(TRANSITIONS_BOOST[s], []);
});

test('une erreur de publication peut être republiée ou refusée', () => {
  assert.ok(peutTransitionner('erreur', 'actif'));
  assert.ok(peutTransitionner('erreur', 'refuse'));
});
