import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheminVideoDepuisUrl, estUrlStockagePublic, estUrlVideoBoutique } from './boost-video.config';

const BASE = 'https://cdn.test';

function avecBase<T>(base: string | undefined, fn: () => T): T {
  const avant = process.env.STORAGE_PUBLIC_URL;
  if (base === undefined) delete process.env.STORAGE_PUBLIC_URL;
  else process.env.STORAGE_PUBLIC_URL = base;
  try {
    return fn();
  } finally {
    if (avant === undefined) delete process.env.STORAGE_PUBLIC_URL;
    else process.env.STORAGE_PUBLIC_URL = avant;
  }
}

test('estUrlStockagePublic : échoue fermé sans STORAGE_PUBLIC_URL', () => {
  assert.equal(avecBase(undefined, () => estUrlStockagePublic('https://exemple.com/boosts/ma-boutique/v.mp4')), false);
  assert.equal(avecBase('', () => estUrlStockagePublic('https://cdn.test/boosts/ma-boutique/v.mp4')), false);
  assert.equal(avecBase('pas une url', () => estUrlStockagePublic('https://cdn.test/boosts/ma-boutique/v.mp4')), false);
});

test('estUrlStockagePublic : même origine et même préfixe uniquement', () => {
  avecBase(BASE, () => {
    assert.equal(estUrlStockagePublic('https://cdn.test/boosts/ma-boutique/v.mp4'), true);
    assert.equal(estUrlStockagePublic('https://cdn.test.evil.com/boosts/ma-boutique/v.mp4'), false);
    assert.equal(estUrlStockagePublic('http://cdn.test/boosts/ma-boutique/v.mp4'), false);
    assert.equal(estUrlStockagePublic('https://autre.test/boosts/ma-boutique/v.mp4'), false);
    assert.equal(estUrlStockagePublic('https://cdn.test'), false);
    assert.equal(estUrlStockagePublic('n importe quoi'), false);
  });
  avecBase('https://exemple.com/medias/', () => {
    assert.equal(estUrlStockagePublic('https://exemple.com/medias/boosts/b/v.mp4'), true);
    assert.equal(estUrlStockagePublic('https://exemple.com/autre/boosts/b/v.mp4'), false);
  });
});

test('estUrlVideoBoutique : préfixe exact boosts/{slug}/ et extension MP4/MOV', () => {
  avecBase(BASE, () => {
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/v.mp4', 'ma-boutique'), true);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/v.MOV', 'ma-boutique'), true);
    // pas une simple inclusion : le dossier doit être à la racine du bucket
    assert.equal(estUrlVideoBoutique('https://cdn.test/produits/boosts/ma-boutique/v.mp4', 'ma-boutique'), false);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/autre/v.mp4', 'ma-boutique'), false);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique-2/v.mp4', 'ma-boutique'), false);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/v.exe', 'ma-boutique'), false);
    // hôte étranger avec le bon chemin
    assert.equal(estUrlVideoBoutique('https://exemple.com/boosts/ma-boutique/v.mp4', 'ma-boutique'), false);
  });
});

test('estUrlVideoBoutique : traversée de chemin refusée', () => {
  avecBase(BASE, () => {
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/../autre/v.mp4', 'ma-boutique'), false);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/%2e%2e/autre/v.mp4', 'ma-boutique'), false);
    assert.equal(estUrlVideoBoutique('https://cdn.test/boosts/ma-boutique/%252e%252e/v.mp4', 'ma-boutique'), false);
  });
});

test('cheminVideoDepuisUrl : seulement boosts/{slug}/{fichier}.mp4|mov, jamais autre chose', () => {
  avecBase(BASE, () => {
    assert.equal(cheminVideoDepuisUrl('https://cdn.test/boosts/ma-boutique/video_1_ab.mp4'), 'boosts/ma-boutique/video_1_ab.mp4');
    assert.equal(cheminVideoDepuisUrl('https://cdn.test/boosts/ma-boutique/video_1_ab.mov'), 'boosts/ma-boutique/video_1_ab.mov');
    assert.equal(cheminVideoDepuisUrl('https://cdn.test/boosts/ma-boutique/miniature.jpg'), null);
    assert.equal(cheminVideoDepuisUrl('https://cdn.test/logos/ma-boutique/logo.mp4'), null);
    assert.equal(cheminVideoDepuisUrl('https://cdn.test/boosts/a/b/c.mp4'), null);
    assert.equal(cheminVideoDepuisUrl('https://exemple.com/boosts/ma-boutique/v.mp4'), null);
    assert.equal(cheminVideoDepuisUrl(null), null);
    assert.equal(cheminVideoDepuisUrl(undefined), null);
    assert.equal(cheminVideoDepuisUrl(''), null);
  });
});
