import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expliquerRemboursement, BoostARembourser } from './remboursement';
import { vendeurBoostRembourseTemplate } from '../../services/email-templates';

const boost = (surcharges: Partial<BoostARembourser> = {}): BoostARembourser => ({
  statut: 'termine',
  total_fcfa: 5200,
  budget_media_fcfa: 4000,
  commission_fcfa: 1200,
  tva_fcfa: 0,
  frais_encaissement_fcfa: 130,
  depense_fcfa: 3780,
  montant_a_rembourser_fcfa: 156,
  note_revue: null,
  ...surcharges
});

const somme = (lignes: { montant: number }[]) => lignes.reduce((t, l) => t + l.montant, 0);

test('boost terminé : détail du reliquat (dépense, commission au prorata, frais) = montant remboursé', () => {
  const e = expliquerRemboursement(boost());
  assert.equal(e.montant, 156);
  assert.deepEqual(e.lignes, [
    { libelle: 'Montant payé', montant: 5200 },
    { libelle: 'Dépensé sur Facebook & Instagram', montant: -3780 },
    { libelle: 'Commission Marché 241 sur la dépense', montant: -1134 },
    { libelle: "Frais d'encaissement (non remboursables)", montant: -130 }
  ]);
  assert.equal(somme(e.lignes), 156);
  assert.match(e.motif, /terminée/);
});

test('boost refusé : remboursement intégral hors frais, motif de la revue repris', () => {
  const e = expliquerRemboursement(boost({ statut: 'refuse', depense_fcfa: 0, montant_a_rembourser_fcfa: 5070, note_revue: 'Visuel non conforme' }));
  assert.equal(somme(e.lignes), 5070);
  assert.match(e.motif, /Visuel non conforme/);
});

test('paiement en double ajouté au reliquat', () => {
  const e = expliquerRemboursement(boost({ montant_a_rembourser_fcfa: 156 + 5200 }), 5200);
  assert.equal(somme(e.lignes), 5356);
  assert.deepEqual(e.lignes.at(-1), { libelle: 'Paiement en double remboursé', montant: 5200 });
  assert.match(e.motif, /double/);
});

test('boost encore ouvert : seul un paiement en trop est remboursé', () => {
  const e = expliquerRemboursement(boost({ statut: 'actif', montant_a_rembourser_fcfa: 5200 }), 5200);
  assert.deepEqual(e.lignes, [{ libelle: 'Paiement en trop', montant: 5200 }]);
});

test('reliquat déjà remboursé puis paiement en double : seul le paiement en trop est expliqué', () => {
  const e = expliquerRemboursement(boost({ montant_a_rembourser_fcfa: 5200 }), 5200);
  assert.deepEqual(e.lignes, [{ libelle: 'Paiement en trop', montant: 5200 }]);
  assert.doesNotMatch(e.motif, /terminée/);
});

test('montant ajusté à la main : pas de détail incohérent, les lignes totalisent le montant', () => {
  const e = expliquerRemboursement(boost({ montant_a_rembourser_fcfa: 100 }));
  assert.deepEqual(e.lignes, [{ libelle: 'Remboursement', montant: 100 }]);
});

test('TVA conservée sur une ligne distincte de la commission', () => {
  const e = expliquerRemboursement(boost({ tva_fcfa: 900, total_fcfa: 6100, montant_a_rembourser_fcfa: 6100 - 3780 - 1134 - 851 - 130 }));
  assert.ok(e.lignes.some((l) => l.libelle === 'TVA sur la commission' && l.montant === -851));
  assert.equal(somme(e.lignes), e.montant);
});

test('e-mail de remboursement : HTML échappé, transfert et version texte', () => {
  const { subject, html, text } = vendeurBoostRembourseTemplate({
    vendeurNom: 'Awa <b>',
    boutiqueNom: 'KALIA & Co',
    titrePub: 'Savon',
    montant: '156 FCFA',
    motif: 'La diffusion est terminée.',
    lignes: [{ libelle: 'Montant payé', montant: '5 200 FCFA' }],
    transfert: { moyen: 'Airtel Money', telephone: '074000000', reference: 'tx-1', date: '24 octobre' },
    lienSuivi: 'https://marche241.ga/admin/kalia/boost/15'
  });
  assert.match(subject, /156 FCFA/);
  assert.ok(html.includes('Awa &lt;b&gt;'));
  assert.ok(html.includes('KALIA &amp; Co'));
  assert.ok(html.includes('tx-1'));
  assert.match(text, /Airtel Money \(074000000\), référence tx-1/);

  const sansTransfert = vendeurBoostRembourseTemplate({
    vendeurNom: 'Awa',
    boutiqueNom: 'KALIA',
    titrePub: 'Savon',
    montant: '156 FCFA',
    motif: 'x',
    lignes: [],
    transfert: null,
    lienSuivi: 'https://marche241.ga'
  });
  assert.match(sansTransfert.text, /Versement effectué par l'équipe Marché 241\./);
  assert.ok(!sansTransfert.html.includes('>Date<'), 'date réelle inconnue hors application : non affichée');
});
