import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from 'joi';
import {
  approuverBoostSchema,
  connexionMetaSchema,
  creerBoostSchema,
  devisSchema,
  estimationImpressionsSchema,
  listeAdminQuerySchema,
  modifierBoostSchema,
  paiementBoostSchema,
  parametresBoostSchema,
  refuserBoostSchema
} from './validation.schemas.boost';

/** Toutes les erreurs d'une validation (comme le middleware : abortEarly false). */
function messages(schema: Schema, valeur: unknown): Record<string, string> {
  const { error } = schema.validate(valeur, { abortEarly: false, stripUnknown: true });
  return Object.fromEntries((error?.details ?? []).map((d) => [d.path.join('.'), d.message]));
}

const ANGLAIS = /\b(must|is not allowed|is required|valid|length|characters|pattern|fails|contains)\b|"/i;

function verifierFrancais(erreurs: Record<string, string>) {
  assert.ok(Object.keys(erreurs).length > 0, 'au moins une erreur attendue');
  for (const [champ, message] of Object.entries(erreurs)) {
    assert.doesNotMatch(message, ANGLAIS, `message non traduit pour ${champ} : ${message}`);
  }
}

test('lien de destination incomplet : message français explicite (cas signalé « https: »)', () => {
  const e = messages(modifierBoostSchema, { url_destination: 'https:' });
  assert.equal(
    e.url_destination,
    'Le lien de destination doit être une adresse web commençant par http:// ou https:// (ex. https://marche241.ga/ma-boutique)'
  );
  assert.match(messages(modifierBoostSchema, { url_destination: 'marche241.ga' }).url_destination, /^Le lien de destination doit être/);
  assert.match(messages(modifierBoostSchema, { url_destination: 'ftp://x.ga' }).url_destination, /http:\/\/ ou https:\/\//);
  assert.deepEqual(messages(modifierBoostSchema, { url_destination: 'https://marche241.ga/ma-boutique' }), {});
});

test('brouillon vendeur : toutes les règles ont un message français', () => {
  verifierFrancais(
    messages(creerBoostSchema, {
      boutique_id: 'abc',
      type_cible: 'magasin',
      produit_id: -1,
      objectif: 'ventes',
      nom: 'x'.repeat(200),
      total_fcfa: 12.5,
      duree_jours: 0,
      url_destination: 'pas une url',
      whatsapp_e164: '077000000',
      titre: 'x'.repeat(81),
      texte_principal: 'x'.repeat(501),
      description: 'x'.repeat(201),
      image_url: 'javascript:alert(1)',
      ciblage: {
        pays: ['US'],
        villes: ['inconnue'],
        age_min: 12,
        age_max: 99,
        sexes: ['autre'],
        langues: ['xx'],
        interets: ['inconnu'],
        etape_wizard: 9
      }
    })
  );
  verifierFrancais(messages(creerBoostSchema, {}));
  verifierFrancais(messages(modifierBoostSchema, {}));
  assert.equal(messages(creerBoostSchema, {}).boutique_id, "L'ID de la boutique est obligatoire");
  assert.equal(messages(modifierBoostSchema, { titre: 'x'.repeat(81) }).titre, 'Le titre ne doit pas dépasser 80 caractères');
  assert.equal(messages(modifierBoostSchema, { duree_jours: 61 }).duree_jours, 'La durée ne doit pas dépasser 60 jours');
});

test('devis, estimations et paiement : messages français', () => {
  verifierFrancais(messages(devisSchema, { total_fcfa: 'x', duree_jours: 0 }));
  verifierFrancais(messages(estimationImpressionsSchema, { totaux_fcfa: [], duree_jours: 'x' }));
  verifierFrancais(messages(paiementBoostSchema, { mode: 'cheque' }));
  verifierFrancais(messages(paiementBoostSchema, { mode: 'mobile', operateur: 'orange', msisdn: '12', email: 'x' }));
  verifierFrancais(messages(paiementBoostSchema, { mode: 'carte', return_url: 'nope' }));
});

test('back-office : messages français', () => {
  verifierFrancais(messages(listeAdminQuerySchema, { statut: 'x', page: 0, limite: 500 }));
  verifierFrancais(messages(approuverBoostSchema, { conformite: ['x'] }));
  verifierFrancais(messages(refuserBoostSchema, { note: 'a' }));
  verifierFrancais(messages(parametresBoostSchema, { commission_bps: -1, packs: [{ code: 'A B', nom: 'x', total_fcfa: 0, duree_jours: 90 }], kill_switch: 'peut-être' }));
  verifierFrancais(messages(parametresBoostSchema, {}));
  verifierFrancais(messages(connexionMetaSchema, { ad_account_id: 'abc' }));
});
