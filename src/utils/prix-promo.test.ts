import { test } from 'node:test';
import assert from 'node:assert/strict';
import Joi from 'joi';
import { prixOriginalCoherent, prixPourStockage, prixPromoJoi, promoValide } from './prix-promo';

test('promo valide : strictement entre 0 et le prix normal', () => {
  assert.equal(promoValide(30000, 15000), true);
  assert.equal(promoValide(30000, 30000), false);
  assert.equal(promoValide(30000, 40000), false);
  assert.equal(promoValide(30000, 0), false);
  assert.equal(promoValide(30000, null), false);
  assert.equal(promoValide(30000, undefined), false);
  assert.equal(promoValide(30000, ''), false);
});

test('stockage : promo valide → prix actif = promo, prix_original = prix normal', () => {
  assert.deepEqual(prixPourStockage(30000, 15000), { prix: 15000, prix_original: 30000 });
  assert.deepEqual(prixPourStockage('30000' as unknown as number, '15000' as unknown as number), {
    prix: 15000,
    prix_original: 30000
  });
});

test('stockage : sans promo ou promo invalide → prix normal conservé (jamais le promo écrasé, jamais 0)', () => {
  assert.deepEqual(prixPourStockage(30000), { prix: 30000, prix_original: null });
  assert.deepEqual(prixPourStockage(30000, null), { prix: 30000, prix_original: null });
  assert.deepEqual(prixPourStockage(30000, 0), { prix: 30000, prix_original: null });
  assert.deepEqual(prixPourStockage(30000, 30000), { prix: 30000, prix_original: null });
  assert.deepEqual(prixPourStockage(30000, 45000), { prix: 30000, prix_original: null });
});

test('prix_original cohérent : seulement s\'il dépasse le prix actif', () => {
  assert.equal(prixOriginalCoherent(15000, 30000), 30000);
  assert.equal(prixOriginalCoherent(40000, 35000), null);
  assert.equal(prixOriginalCoherent(15000, 15000), null);
  assert.equal(prixOriginalCoherent(15000, null), null);
  assert.equal(prixOriginalCoherent(15000, undefined), null);
});

test('validation Joi prix_promo : 400 si promo >= prix, 0/null acceptés, sans prix pas de comparaison', () => {
  const schema = Joi.object({ prix: Joi.number().min(0), prix_promo: prixPromoJoi });
  assert.equal(schema.validate({ prix: 30000, prix_promo: 15000 }).error, undefined);
  assert.equal(schema.validate({ prix: 30000, prix_promo: 0 }).error, undefined);
  assert.equal(schema.validate({ prix: 30000, prix_promo: null }).error, undefined);
  assert.equal(schema.validate({ prix: 30000 }).error, undefined);
  assert.equal(schema.validate({ prix_promo: 15000 }).error, undefined);
  const egal = schema.validate({ prix: 30000, prix_promo: 30000 }).error;
  assert.equal(egal?.details[0].message, 'Le prix promotionnel doit être inférieur au prix normal');
  assert.ok(schema.validate({ prix: 30000, prix_promo: 40000 }).error);
  assert.equal(schema.validate({ prix: 30000, prix_promo: -1 }).error?.details[0].message, 'Le prix promotionnel doit être positif');
});
