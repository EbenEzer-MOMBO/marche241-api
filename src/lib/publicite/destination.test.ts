import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterUtmPublicite, erreurUrlExterne, urlBoutique, urlProduit } from './destination';

test('URL vendeur construite depuis la boutique', () => {
  assert.equal(urlBoutique('https://marche241.ga/', 'chez-awa'), 'https://marche241.ga/chez-awa');
  assert.equal(urlProduit('https://marche241.ga', 'chez-awa', 42), 'https://marche241.ga/chez-awa/produit/42');
});

test('URL externe : https obligatoire', () => {
  assert.equal(erreurUrlExterne('https://exemple.ga/promo'), null);
  assert.match(erreurUrlExterne('http://exemple.ga') ?? '', /https/);
  assert.match(erreurUrlExterne('javascript:alert(1)') ?? '', /https/);
  assert.match(erreurUrlExterne('pas une url') ?? '', /valide/);
  assert.match(erreurUrlExterne('') ?? '', /obligatoire/);
  assert.match(erreurUrlExterne('https://a:b@exemple.ga') ?? '', /identifiants/);
});

test('UTM uniquement sur les liens Marché 241', () => {
  assert.equal(
    ajouterUtmPublicite('https://marche241.ga/chez-awa', 5, 'https://marche241.ga'),
    'https://marche241.ga/chez-awa?utm_source=marche241&utm_medium=banniere&utm_campaign=pub_5'
  );
  assert.equal(ajouterUtmPublicite('https://exemple.ga/', 5, 'https://marche241.ga'), 'https://exemple.ga/');
});
