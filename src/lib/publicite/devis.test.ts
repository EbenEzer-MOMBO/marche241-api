import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devisPublicite, remboursementProrata } from './devis';

const tarifs = { categorie: 1500, accueil: 3000, premium: 6000 };

test('devis : 1 semaine Accueil', () => {
  const d = devisPublicite('accueil', 1, tarifs, true, 250);
  assert.equal(d.total_fcfa, 3000);
  assert.equal(d.remise_fcfa, 0);
  assert.equal(d.frais_encaissement_fcfa, 75);
});

test('devis : remise 4 pour 3 par tranche complète', () => {
  const cas: Array<[number, number, number]> = [
    // [semaines, remise, total] pour l'Accueil à 3 000
    [3, 0, 9000],
    [4, 3000, 9000],
    [5, 3000, 12_000],
    [8, 6000, 18_000],
    [12, 9000, 27_000]
  ];
  for (const [semaines, remise, total] of cas) {
    const d = devisPublicite('accueil', semaines, tarifs, true, 0);
    assert.equal(d.remise_fcfa, remise, `${semaines} semaines`);
    assert.equal(d.total_fcfa, total, `${semaines} semaines`);
    assert.equal(d.sous_total_fcfa - d.remise_fcfa, d.total_fcfa);
  }
});

test('devis : remise désactivée', () => {
  assert.equal(devisPublicite('premium', 4, tarifs, false, 0).total_fcfa, 24_000);
});

test('devis : catégorie et premium', () => {
  assert.equal(devisPublicite('categorie', 2, tarifs, true, 0).total_fcfa, 3000);
  assert.equal(devisPublicite('premium', 4, tarifs, true, 0).total_fcfa, 18_000);
});

test('devis : nombre de semaines ou tarif invalide', () => {
  assert.throws(() => devisPublicite('accueil', 0, tarifs, true, 0));
  assert.throws(() => devisPublicite('accueil', 1.5, tarifs, true, 0));
  assert.throws(() => devisPublicite('accueil', 1, { ...tarifs, accueil: 0 }, true, 0));
});

test('remboursement : refus avant diffusion = total moins frais', () => {
  assert.equal(remboursementProrata(9000, 225, 3, 3), 8775);
});

test('remboursement : annulation à mi-parcours au prorata, frais conservés', () => {
  assert.equal(remboursementProrata(9000, 225, 3, 1), 3000);
  assert.equal(remboursementProrata(9000, 225, 3, 0), 0);
  assert.equal(remboursementProrata(0, 0, 3, 3), 0);
});
