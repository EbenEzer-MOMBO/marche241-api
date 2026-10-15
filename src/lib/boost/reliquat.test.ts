import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerCloture, fraisEncaissement, remboursementIntegral, bilanProvisoire, montantApresBilan } from './reliquat';

const montants = { total_fcfa: 30_000, budget_media_fcfa: 25_000, commission_fcfa: 5000, tva_fcfa: 0 };

test('aucune dépense : tout est remboursé', () => {
  assert.equal(calculerCloture(montants, 0).montant_a_rembourser_fcfa, 30_000);
});

test('dépense partielle : commission au prorata', () => {
  const c = calculerCloture(montants, 10_000);
  assert.equal(c.commission_conservee_fcfa, 2000);
  assert.equal(c.montant_a_rembourser_fcfa, 30_000 - 10_000 - 2000);
});

test('dépense totale : rien à rembourser', () => {
  assert.equal(calculerCloture(montants, 25_000).montant_a_rembourser_fcfa, 0);
});

test('sur-dépense Meta plafonnée au budget média', () => {
  const c = calculerCloture(montants, 27_000);
  assert.equal(c.depense_fcfa, 25_000);
  assert.equal(c.montant_a_rembourser_fcfa, 0);
});

test('TVA conservée au prorata', () => {
  const c = calculerCloture({ total_fcfa: 11_800, budget_media_fcfa: 8000, commission_fcfa: 2000, tva_fcfa: 1800 }, 4000);
  assert.equal(c.tva_conservee_fcfa, 900);
  assert.equal(c.montant_a_rembourser_fcfa, 11_800 - 4000 - 1000 - 900);
});

test('remboursement intégral', () => {
  assert.equal(remboursementIntegral(montants), 30_000);
});

const avecFrais = { ...montants, frais_encaissement_fcfa: fraisEncaissement(30_000, 250) };

test('frais d’encaissement : 2,5 % arrondis, jamais négatifs', () => {
  assert.equal(fraisEncaissement(30_000, 250), 750);
  assert.equal(fraisEncaissement(7500, 250), 188);
  assert.equal(fraisEncaissement(3000, 0), 0);
  assert.equal(fraisEncaissement(-10, 250), 0);
});

test('refus ou rejet : tout est remboursé sauf les frais d’encaissement', () => {
  assert.equal(remboursementIntegral(avecFrais), 30_000 - 750);
  assert.equal(calculerCloture(avecFrais, 0).montant_a_rembourser_fcfa, 30_000 - 750);
});

test('dépense partielle : frais d’encaissement retenus en plus de la commission au prorata', () => {
  const c = calculerCloture(avecFrais, 10_000);
  assert.equal(c.frais_encaissement_fcfa, 750);
  assert.equal(c.montant_a_rembourser_fcfa, 30_000 - 10_000 - 2000 - 750);
});

test('dépense totale : rien à rembourser (les frais sont couverts par la commission)', () => {
  assert.equal(calculerCloture(avecFrais, 25_000).montant_a_rembourser_fcfa, 0);
});

test('boost soumis avant la règle (frais 0) : remboursement intégral inchangé', () => {
  assert.equal(remboursementIntegral({ ...montants, frais_encaissement_fcfa: 0 }), 30_000);
});

test('bilan provisoire pendant 24 h après la clôture d’un boost terminé', () => {
  const maintenant = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(bilanProvisoire({ statut: 'termine', date_cloture: '2026-10-15T22:08:00Z' }, maintenant), true);
  assert.equal(bilanProvisoire({ statut: 'termine', date_cloture: '2026-10-15T10:00:00Z' }, maintenant), false);
  assert.equal(bilanProvisoire({ statut: 'rejete_meta', date_cloture: '2026-10-16T11:00:00Z' }, maintenant), false);
  assert.equal(bilanProvisoire({ statut: 'termine', date_cloture: null }, maintenant), false);
});

test('montant après bilan : la part clôture est remplacée, les autres crédits conservés', () => {
  // clôture provisoire 1 600 FCFA, la dépense remonte : plus rien à rembourser
  assert.equal(montantApresBilan(1600, 1600, 0), 0);
  // un paiement en double (3 000) reste dû, la part clôture passe de 1 600 à 400
  assert.equal(montantApresBilan(4600, 1600, 400), 3400);
  assert.equal(montantApresBilan(0, 0, 250), 250);
});
