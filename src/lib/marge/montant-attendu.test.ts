import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montantAttenduPourPaiement } from './montant-attendu';
import { normaliserTauxMarge } from './marge';

const commande = { totalArticles: 17_000, fraisLivraison: 1_500 };

test('montantAttenduPourPaiement : commande à 30 %, chaque type de paiement', () => {
  assert.equal(montantAttenduPourPaiement('paiement_complet', commande, 30)?.montant, 24_050);
  assert.equal(montantAttenduPourPaiement('frais_livraison', commande, 30)?.montant, 1_950);
  assert.equal(montantAttenduPourPaiement('solde_apres_livraison', commande, 30)?.montant, 22_100);
  // acompte : 50 % de (articles + livraison) = 9 250, puis frais de service à 30 %
  assert.equal(montantAttenduPourPaiement('acompte', commande, 30)?.montant, 12_025);
});

test('montantAttenduPourPaiement : à 10 %, identique à l’ancien calcul Math.round(x * 1.1)', () => {
  const ancien = (montant: number) => Math.round(montant * 1.1);

  assert.equal(montantAttenduPourPaiement('paiement_complet', commande, 10)?.montant, ancien(18_500));
  assert.equal(montantAttenduPourPaiement('frais_livraison', commande, 10)?.montant, ancien(1_500));
  assert.equal(montantAttenduPourPaiement('solde_apres_livraison', commande, 10)?.montant, ancien(17_000));
  assert.equal(montantAttenduPourPaiement('acompte', commande, 10)?.montant, ancien(9_250));
});

test('montantAttenduPourPaiement : sans frais de livraison, le montant attendu des frais est 0', () => {
  assert.equal(montantAttenduPourPaiement('frais_livraison', { totalArticles: 5_000, fraisLivraison: 0 }, 30)?.montant, 0);
});

test('montantAttenduPourPaiement : complement non contrôlé, type inconnu replié sur le total', () => {
  assert.equal(montantAttenduPourPaiement('complement', commande, 30), null);

  const inconnu = montantAttenduPourPaiement('autre_type', commande, 30);
  assert.equal(inconnu?.typeInconnu, true);
  assert.equal(inconnu?.montant, 24_050);
  assert.equal(montantAttenduPourPaiement('paiement_complet', commande, 30)?.typeInconnu, false);
});

test('montantAttenduPourPaiement : la description mentionne le taux de la commande', () => {
  assert.match(montantAttenduPourPaiement('paiement_complet', commande, 30)?.description ?? '', /30%/);
});

test('taux figé : le taux lu sur la commande prime, même si celui du vendeur change ensuite', () => {
  const tauxVendeurApresChangement = 50;
  const tauxCommande = normaliserTauxMarge(20);

  assert.notEqual(tauxCommande, tauxVendeurApresChangement);
  assert.equal(montantAttenduPourPaiement('paiement_complet', commande, tauxCommande)?.montant, 22_200);
});

test('commande antérieure à la migration 037 (taux absent ou invalide) : taux historique de 10 %', () => {
  for (const tauxAbsent of [undefined, null, 'abc', 7, 80]) {
    const taux = normaliserTauxMarge(tauxAbsent);
    assert.equal(montantAttenduPourPaiement('paiement_complet', commande, taux)?.montant, Math.round(18_500 * 1.1));
  }
});
