import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  empreinteBillet,
  estCommandeValide,
  estDansFenetre,
  fenetreScan,
  horodatageScan,
  lireDateEvenement,
  lireQrBillet,
  TOLERANCE_HORLOGE_MS
} from './regles';

const JETON = 'a'.repeat(48);

test('QR : format M241|jeton|numero', () => {
  assert.deepEqual(lireQrBillet(`M241|${JETON}|42`), { jeton: JETON, numero: 42 });
  assert.deepEqual(lireQrBillet(` M241|${JETON.toUpperCase()}|7 `), { jeton: JETON, numero: 7 });
});

test('QR : formats refusés', () => {
  for (const brut of [null, '', 'https://exemple.ga', `EVT|${JETON}|1`, `M241|${JETON}|0`, `M241|zz|1`, `M241|${JETON}|1|x`]) {
    assert.equal(lireQrBillet(brut), null, String(brut));
  }
});

test('empreinte : stable, insensible à la casse du jeton, différente par numéro', () => {
  assert.equal(empreinteBillet(JETON, 1), empreinteBillet(JETON.toUpperCase(), 1));
  assert.notEqual(empreinteBillet(JETON, 1), empreinteBillet(JETON, 2));
  assert.match(empreinteBillet(JETON, 1), /^[a-f0-9]{64}$/);
});

test('date sans fuseau = heure du Gabon (UTC+1)', () => {
  assert.equal(lireDateEvenement('2026-10-23T16:30')?.toISOString(), '2026-10-23T15:30:00.000Z');
  assert.equal(lireDateEvenement('2026-10-23T16:30:00Z')?.toISOString(), '2026-10-23T16:30:00.000Z');
  assert.equal(lireDateEvenement('pas une date'), null);
  assert.equal(lireDateEvenement(undefined), null);
});

test('fenêtre : 1 h avant le début jusqu’à la fin saisie', () => {
  const f = fenetreScan({ date_debut: '2026-10-23T16:30', date_fin: '2026-10-23T19:30' });
  assert.ok(f);
  assert.equal(f.ouverture.toISOString(), '2026-10-23T14:30:00.000Z');
  assert.equal(f.fermeture.toISOString(), '2026-10-23T18:30:00.000Z');
  assert.equal(f.fin_par_defaut, false);
  assert.equal(estDansFenetre(f, new Date('2026-10-23T14:29:59Z')), false);
  assert.equal(estDansFenetre(f, new Date('2026-10-23T14:30:00Z')), true);
  assert.equal(estDansFenetre(f, new Date('2026-10-23T18:30:00Z')), true);
  assert.equal(estDansFenetre(f, new Date('2026-10-23T18:30:01Z')), false);
});

test('fenêtre : sans date de fin (ou fin incohérente) = début + 12 h', () => {
  const sansFin = fenetreScan({ date_debut: '2026-10-23T20:00' });
  assert.equal(sansFin?.fermeture.toISOString(), '2026-10-24T07:00:00.000Z');
  assert.equal(sansFin?.fin_par_defaut, true);
  const finAvant = fenetreScan({ date_debut: '2026-10-23T20:00', date_fin: '2026-10-23T19:00' });
  assert.equal(finAvant?.fin_par_defaut, true);
  assert.equal(fenetreScan({}), null);
  assert.equal(estDansFenetre(null, new Date()), false);
});

test('fenêtre : tolérance d’horloge pour les scans hors-ligne', () => {
  const f = fenetreScan({ date_debut: '2026-10-23T16:30', date_fin: '2026-10-23T19:30' });
  const justeApres = new Date(f!.fermeture.getTime() + TOLERANCE_HORLOGE_MS - 1);
  assert.equal(estDansFenetre(f, justeApres), false);
  assert.equal(estDansFenetre(f, justeApres, TOLERANCE_HORLOGE_MS), true);
});

test('commande valide : payée, ni annulée ni remboursée', () => {
  assert.equal(estCommandeValide({ statut: 'confirmee', statut_paiement: 'paye' }), true);
  assert.equal(estCommandeValide({ statut: 'livree', statut_paiement: 'paye' }), true);
  assert.equal(estCommandeValide({ statut: 'annulee', statut_paiement: 'paye' }), false);
  assert.equal(estCommandeValide({ statut: 'remboursee', statut_paiement: 'paye' }), false);
  assert.equal(estCommandeValide({ statut: 'confirmee', statut_paiement: 'en_attente' }), false);
  assert.equal(estCommandeValide({ statut: 'confirmee', statut_paiement: 'rembourse' }), false);
});

test('horodatage hors-ligne : futur refusé au-delà de la tolérance, ramené à la réception sinon', () => {
  const recu = new Date('2026-10-23T18:00:00Z');
  assert.equal(horodatageScan(new Date('2026-10-23T17:00:00Z'), recu)?.toISOString(), '2026-10-23T17:00:00.000Z');
  assert.equal(horodatageScan(new Date('2026-10-23T18:05:00Z'), recu)?.toISOString(), recu.toISOString());
  assert.equal(horodatageScan(new Date('2026-10-23T18:11:00Z'), recu), null);
  assert.equal(horodatageScan(new Date('x'), recu), null);
});
