import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avecMarge, commissionDepuisBrut, normaliserTauxMarge, TAUX_MARGE_DEFAUT } from './marge';

test('avecMarge : 10 % identique à l’ancien calcul Math.round(x * 1.1)', () => {
  for (const montant of [0, 1, 5, 999, 15_000, 23_457, 1_234_567]) {
    assert.equal(avecMarge(montant, 10), Math.round(montant * 1.1));
  }
});

test('avecMarge : taux personnalisés', () => {
  assert.equal(avecMarge(10_000, 25), 12_500);
  assert.equal(avecMarge(10_000, 50), 15_000);
  assert.equal(avecMarge(3333, 15), 3833);
});

test('commissionDepuisBrut : 10 % vaut 1/11 du brut', () => {
  assert.equal(commissionDepuisBrut(11_000, 10), 1000);
  assert.equal(commissionDepuisBrut(12_500, 25), 2500);
  assert.equal(commissionDepuisBrut(15_000, 50), 5000);
});

test('normaliserTauxMarge : bornes et valeurs invalides', () => {
  assert.equal(normaliserTauxMarge(10), 10);
  assert.equal(normaliserTauxMarge(50), 50);
  assert.equal(normaliserTauxMarge('20'), 20);
  assert.equal(normaliserTauxMarge(9), TAUX_MARGE_DEFAUT);
  assert.equal(normaliserTauxMarge(51), TAUX_MARGE_DEFAUT);
  assert.equal(normaliserTauxMarge(12.5), TAUX_MARGE_DEFAUT);
  assert.equal(normaliserTauxMarge(undefined), TAUX_MARGE_DEFAUT);
  assert.equal(normaliserTauxMarge(null), TAUX_MARGE_DEFAUT);
});
