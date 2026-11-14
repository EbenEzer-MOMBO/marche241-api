import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decisionLivraisonAuto,
  lireParametresLivraisonAuto,
  livraisonAutoActive,
  type EntreeLivraisonAuto
} from './livraison-auto';

const confirmation = new Date('2026-11-01T08:00:00Z');
const apres = (jours: number, heures = 0): Date => new Date(confirmation.getTime() + (jours * 24 + heures) * 3600 * 1000);
const params = lireParametresLivraisonAuto({});

function entree(partiel: Partial<EntreeLivraisonAuto> & { maintenant: Date }): EntreeLivraisonAuto {
  return { rappelsEnvoyes: 0, dateConfirmation: confirmation, dateDernierRappel: null, ...partiel };
}

test('paramètres par défaut : rappels J+7 et J+9, livraison J+10', () => {
  assert.deepEqual(params, { joursLivraison: 10, joursRappel1: 7, joursRappel2: 9, delaiMinApresRappelHeures: 20 });
});

test('LIVRAISON_AUTO_JOURS personnalisé, invalide ou trop court', () => {
  assert.equal(lireParametresLivraisonAuto({ LIVRAISON_AUTO_JOURS: '14' }).joursRappel1, 11);
  assert.equal(lireParametresLivraisonAuto({ LIVRAISON_AUTO_JOURS: 'abc' }).joursLivraison, 10);
  assert.equal(lireParametresLivraisonAuto({ LIVRAISON_AUTO_JOURS: '2' }).joursLivraison, 10);
});

test('avant J+7 : rien', () => {
  assert.equal(decisionLivraisonAuto(entree({ maintenant: apres(6, 23) }), params), 'rien');
});

test('à J+7 : premier rappel', () => {
  assert.equal(decisionLivraisonAuto(entree({ maintenant: apres(7) }), params), 'rappel_1');
});

test('un rappel envoyé, avant J+9 : rien (pas de doublon du rappel 1)', () => {
  const e = entree({ rappelsEnvoyes: 1, dateDernierRappel: apres(7), maintenant: apres(8, 23) });
  assert.equal(decisionLivraisonAuto(e, params), 'rien');
});

test('un rappel envoyé, à J+9 : second rappel', () => {
  const e = entree({ rappelsEnvoyes: 1, dateDernierRappel: apres(7), maintenant: apres(9) });
  assert.equal(decisionLivraisonAuto(e, params), 'rappel_2');
});

test('commande ancienne (J+20) : un seul rappel par jour, jamais deux d\'un coup', () => {
  assert.equal(decisionLivraisonAuto(entree({ maintenant: apres(20) }), params), 'rappel_1');
  const apresRappel1 = entree({ rappelsEnvoyes: 1, dateDernierRappel: apres(20), maintenant: apres(20, 2) });
  assert.equal(decisionLivraisonAuto(apresRappel1, params), 'rien');
  const lendemain = entree({ rappelsEnvoyes: 1, dateDernierRappel: apres(20), maintenant: apres(21) });
  assert.equal(decisionLivraisonAuto(lendemain, params), 'rappel_2');
});

test('2 rappels, J+10 mais dernier rappel il y a moins de 20 h : rien', () => {
  const e = entree({ rappelsEnvoyes: 2, dateDernierRappel: apres(9, 8), maintenant: apres(10) });
  assert.equal(decisionLivraisonAuto(e, params), 'rien');
});

test('2 rappels, J+10 et dernier rappel >= 20 h : livrer', () => {
  const e = entree({ rappelsEnvoyes: 2, dateDernierRappel: apres(9), maintenant: apres(10) });
  assert.equal(decisionLivraisonAuto(e, params), 'livrer');
});

test('2 rappels mais avant J+10 : rien', () => {
  const e = entree({ rappelsEnvoyes: 2, dateDernierRappel: apres(9), maintenant: apres(9, 22) });
  assert.equal(decisionLivraisonAuto(e, params), 'rien');
});

test('cron interrompu jusqu\'à J+15 : le rappel 1 part d\'abord, jamais de livraison directe', () => {
  assert.equal(decisionLivraisonAuto(entree({ maintenant: apres(15) }), params), 'rappel_1');
  const e1 = entree({ rappelsEnvoyes: 1, dateDernierRappel: apres(15), maintenant: apres(16) });
  assert.equal(decisionLivraisonAuto(e1, params), 'rappel_2');
  const e2 = entree({ rappelsEnvoyes: 2, dateDernierRappel: apres(16), maintenant: apres(16, 2) });
  assert.equal(decisionLivraisonAuto(e2, params), 'rien');
  const e3 = entree({ rappelsEnvoyes: 2, dateDernierRappel: apres(16), maintenant: apres(17) });
  assert.equal(decisionLivraisonAuto(e3, params), 'livrer');
});

test('sans date de confirmation : rien', () => {
  assert.equal(decisionLivraisonAuto(entree({ dateConfirmation: null, maintenant: apres(30) }), params), 'rien');
  assert.equal(decisionLivraisonAuto(entree({ dateConfirmation: undefined, maintenant: apres(30) }), params), 'rien');
});

test('2 rappels mais date du dernier rappel inconnue : rien (on ne livre pas sans preuve du préavis)', () => {
  const e = entree({ rappelsEnvoyes: 2, dateDernierRappel: null, maintenant: apres(12) });
  assert.equal(decisionLivraisonAuto(e, params), 'rien');
});

test('interrupteur LIVRAISON_AUTO_ACTIVE', () => {
  assert.equal(livraisonAutoActive({}), true);
  assert.equal(livraisonAutoActive({ LIVRAISON_AUTO_ACTIVE: 'true' }), true);
  assert.equal(livraisonAutoActive({ LIVRAISON_AUTO_ACTIVE: 'false' }), false);
  assert.equal(livraisonAutoActive({ LIVRAISON_AUTO_ACTIVE: ' FALSE ' }), false);
});
