import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prixSelectionServeur } from './prix-commande';

const vetement = {
  prix: 10000,
  variants: {
    type: 'vetements',
    variants: [
      { id: 'v1', nom: 'Noir', prix: 12000 },
      { id: 'v2', nom: 'Beige' },
      { id: 'v3', nom: 'Vert', prix: 20000, prix_promo: 15000 }
    ],
    personnalisations: [{ id: 'p1', libelle: 'Prénom', prix_supplementaire: 3000 }]
  }
};

const prix = (produit: any, sel: any) => {
  const r = prixSelectionServeur(produit, sel);
  assert.ok(r.ok, 'sélection acceptée');
  return r.ok ? r : { prixBase: -1, prixUnitaire: -1 };
};

test('prix du variant choisi : le prix envoyé par le client est ignoré', () => {
  const r = prix(vetement, { variant: { id: 'v1', nom: 'Noir - Taille M', prix: 1 } });
  assert.equal(r.prixUnitaire, 12000);
  assert.equal(r.prixBase, 12000);
});

test('variant en promotion valide : prix promo facturé', () => {
  assert.equal(prix(vetement, { variant: { id: 'v3', prix: 20000 } }).prixUnitaire, 15000);
});

test('promo invalide (>= prix) ou nulle : prix normal', () => {
  const produit = { prix: 0, variants: { variants: [
    { id: 'a', prix: 5000, prix_promo: 5000 },
    { id: 'b', prix: 5000, prix_promo: 0 },
    { id: 'c', prix: 5000, prix_promo: 9000 }
  ] } };
  for (const id of ['a', 'b', 'c']) assert.equal(prix(produit, { variant: { id } }).prixUnitaire, 5000);
});

test('variant reconnu sans prix propre : prix du produit', () => {
  assert.equal(prix(vetement, { variant: { id: 'v2', prix: 1 } }).prixUnitaire, 10000);
});

test('produit à variants : variant manquant ou inconnu refusé (pas de repli sur le prix de base)', () => {
  for (const sel of [null, {}, { variant: { id: 'zzz', prix: 1 } }, { variant: 'x' }, { personnalisations: [] }]) {
    const r = prixSelectionServeur(vetement, sel);
    assert.equal(r.ok, false);
  }
});

test('produit sans variants : prix du produit', () => {
  assert.equal(prix({ prix: 7500 }, { variant: { id: 'x', prix: 1 } }).prixUnitaire, 7500);
  assert.equal(prix({ prix: 7500, variants: [{ nom: 'Couleur', options: ['Rouge'] }] }, null).prixUnitaire, 7500);
});

test('personnalisation : supplément lu sur le produit, ajouté à prixUnitaire mais pas à prixBase', () => {
  const sel = { variant: { id: 'v1' }, personnalisations: [{ id: 'p1', prix_supplementaire: 0 }] };
  const r = prix(vetement, sel);
  assert.equal(r.prixUnitaire, 15000);
  assert.equal(r.prixBase, 12000);
});

test('personnalisation inconnue ou en double : ignorée / comptée une fois', () => {
  const sel = {
    variant: { id: 'v2' },
    personnalisations: [{ id: 'p1' }, { id: 'p1' }, { id: 'x', prix_supplementaire: 9999 }]
  };
  assert.equal(prix(vetement, sel).prixUnitaire, 13000);
});

test('billet : prix du variant par nom, promo comprise', () => {
  const billet = { prix: 0, variants: { variants: [
    { id: 'a', nom: 'Billet Argent', prix: 35000 },
    { id: 'o', nom: 'Billet Or', prix: 50000, prix_promo: 40000 }
  ] } };
  assert.equal(prix(billet, { variant: { nom: 'Billet Argent', prix: 1 } }).prixUnitaire, 35000);
  assert.equal(prix(billet, { variant: { nom: 'Billet Or', prix: 1 } }).prixUnitaire, 40000);
});
