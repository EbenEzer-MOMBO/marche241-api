import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliserInfosParticipants,
  signatureInfosParticipants,
  validerEtNormaliserParticipants,
  verifierInfosParticipantsConfig
} from './produit-evenement';

const produit = (infos: unknown) => ({ nom: 'Gala', variants: { type: 'evenement', meta: { infos_participants: infos } } });

test('config inactive : champs vides et signature identique à l’absence de config', () => {
  assert.deepEqual(normaliserInfosParticipants({ actif: false, champs: ['email'] }), { actif: false, champs: [] });
  assert.equal(signatureInfosParticipants({ actif: false, champs: ['nom_complet'] }), signatureInfosParticipants(undefined));
});

test('config active : nom_complet ajouté d’office', () => {
  assert.deepEqual(normaliserInfosParticipants({ actif: true, champs: ['email'] }).champs, ['nom_complet', 'email']);
});

test('validation de la config : champ inconnu refusé', () => {
  const erreurs = verifierInfosParticipantsConfig({ meta: { infos_participants: { actif: true, champs: ['x'] } } });
  assert.equal(erreurs[0]?.code, 'INFOS_PARTICIPANTS_INVALIDE');
});

test('participants : ignorés quand la collecte est inactive', () => {
  const r = validerEtNormaliserParticipants(produit({ actif: false }), 1, [{ nom_complet: { x: 1 } }]);
  assert.deepEqual(r, { ok: true, participants: [] });
});

test('participants : nombre de fiches différent de la quantité', () => {
  const r = validerEtNormaliserParticipants(produit({ actif: true, champs: ['nom_complet'] }), 2, [{ nom_complet: 'A' }]);
  assert.equal(r.ok, false);
});

test('participants : champ manquant, email invalide, valeur trop longue', () => {
  const cfg = produit({ actif: true, champs: ['nom_complet', 'email'] });
  const r = validerEtNormaliserParticipants(cfg, 3, [
    { nom_complet: '', email: 'a@b.cd' },
    { nom_complet: 'B', email: 'pas-un-email' },
    { nom_complet: 'x'.repeat(201), email: 'c@d.ef' }
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.erreurs.map((e) => e.code), ['PARTICIPANT_CHAMP_REQUIS', 'PARTICIPANT_EMAIL_INVALIDE', 'PARTICIPANT_CHAMP_TROP_LONG']);
  }
});

test('participants : fiches valides normalisées', () => {
  const r = validerEtNormaliserParticipants(produit({ actif: true, champs: ['nom_complet'] }), 1, [{ nom_complet: ' Jean ', email: 'x' }]);
  assert.deepEqual(r, { ok: true, participants: [{ nom_complet: 'Jean' }] });
});
