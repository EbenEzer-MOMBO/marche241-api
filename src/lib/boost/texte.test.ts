import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterLienBoutique, contientLienBoutique, lienBoutiquePublic } from './texte';

const lien = 'https://marche241.ga/kalia';

test('le lien de la boutique est ajouté en fin de texte', () => {
  assert.equal(
    ajouterLienBoutique('Découvrez le Savon à l’hysope.\n💰 10 000 FCFA  \n', lien),
    'Découvrez le Savon à l’hysope.\n💰 10 000 FCFA\n\n🛍️ Boutique : https://marche241.ga/kalia'
  );
  assert.equal(ajouterLienBoutique('', lien), '🛍️ Boutique : https://marche241.ga/kalia');
});

test('rien n’est ajouté si le vendeur a déjà mis le lien (avec ou sans https, page produit comprise)', () => {
  for (const texte of [
    'Commandez sur https://marche241.ga/kalia',
    'Commandez sur marche241.ga/kalia !',
    'Lien : www.marche241.ga/kalia/produit/530',
    'MARCHE241.GA/KALIA?utm_source=x'
  ]) {
    assert.equal(contientLienBoutique(texte, lien), true, texte);
    assert.equal(ajouterLienBoutique(texte, lien), texte);
  }
});

test('le lien d’une autre boutique au nom proche ne compte pas', () => {
  assert.equal(contientLienBoutique('Voir marche241.ga/kalia2', lien), false);
  assert.equal(contientLienBoutique('Voir marche241.ga/kalia-shop', lien), false);
});

test('lien public : origine Marché 241 du lien de destination, sinon le site officiel (jamais localhost)', () => {
  assert.equal(lienBoutiquePublic('kalia', 'https://marche241.ga/kalia/produit/530?utm_source=x'), 'https://marche241.ga/kalia');
  assert.equal(lienBoutiquePublic('kalia', 'http://localhost:3000/kalia'), 'https://marche241.ga/kalia');
  assert.equal(lienBoutiquePublic('kalia', 'https://exemple.com/x'), 'https://marche241.ga/kalia');
  assert.equal(lienBoutiquePublic('kalia', null), 'https://marche241.ga/kalia');
});

test('sans chemin de boutique, une simple mention du site ne compte pas', () => {
  assert.equal(contientLienBoutique('Commandez sur marche241.ga', 'https://marche241.ga/'), false);
});
