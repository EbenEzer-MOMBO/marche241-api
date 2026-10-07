import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerExterneSchema, creerPubliciteSchema, disponibilitesQuerySchema, parametresPubliciteSchema } from './validation.schemas.publicite';

const messages = (r: { error?: { details: Array<{ message: string }> } }) => (r.error?.details ?? []).map((d) => d.message);

test('brouillon : formule inconnue → message français', () => {
  const r = creerPubliciteSchema.validate({ boutique_id: 1, formule: 'banniere' }, { abortEarly: false });
  assert.deepEqual(messages(r), ['La formule doit être Catégorie, Accueil ou Premium']);
});

test('brouillon : semaine au mauvais format', () => {
  const r = creerPubliciteSchema.validate({ boutique_id: 1, semaine_debut: '12/10/2026' });
  assert.match(messages(r)[0], /AAAA-MM-JJ/);
});

test('disponibilités : catégorie obligatoire pour la formule Catégorie', () => {
  assert.ok(disponibilitesQuerySchema.validate({ formule: 'categorie' }).error);
  assert.equal(disponibilitesQuerySchema.validate({ formule: 'accueil' }).error, undefined);
});

test('externe : champs obligatoires et mode de paiement', () => {
  const r = creerExterneSchema.validate({ formule: 'accueil', mode_paiement: 'ebilling' }, { abortEarly: false });
  const m = messages(r).join(' | ');
  assert.match(m, /nom de l'annonceur est obligatoire/);
  assert.match(m, /payé hors plateforme/);
  assert.match(m, /visuel est obligatoire/);
});

test('paramètres : semaines max ≤ horizon', () => {
  assert.ok(parametresPubliciteSchema.validate({ semaines_max: 20, semaines_avance_max: 12 }).error);
  assert.equal(parametresPubliciteSchema.validate({ semaines_max: 8, semaines_avance_max: 12 }).error, undefined);
  assert.ok(parametresPubliciteSchema.validate({}).error);
});
