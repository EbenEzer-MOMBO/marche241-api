import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockDisponibleSelection } from './stock-variant';

const billets = {
  type: 'evenement',
  variants: [
    { id: 'b', nom: 'Billet Bronze', prix: 25000, stock: 0 },
    { id: 'a', nom: 'Billet Argent', prix: 35000, stock: 4 }
  ]
};

test('billet épuisé : stock du variant (champ stock) pris en compte malgré un stock global > 0', () => {
  const produit = { quantite_stock: 4, variants: billets };
  assert.equal(stockDisponibleSelection(produit, { variant: { id: 'b', nom: 'Billet Bronze' } }), 0);
});

test('billet disponible : borné par le stock global', () => {
  const produit = { quantite_stock: 2, variants: billets };
  assert.equal(stockDisponibleSelection(produit, { variant: { id: 'a', nom: 'Billet Argent' } }), 2);
});

test('variant retrouvé par nom si l\'id manque', () => {
  const produit = { quantite_stock: 4, variants: billets };
  assert.equal(stockDisponibleSelection(produit, { variant: { nom: 'Billet Bronze' } }), 0);
});

test('vêtements : stock par taille', () => {
  const produit = {
    quantite_stock: 9,
    variants: { type: 'vetements', variants: [{ id: 'v', nom: 'Rouge', tailles: [{ taille: 'M', stock: 1 }, { taille: 'L', stock: 0 }] }] }
  };
  assert.equal(stockDisponibleSelection(produit, { variant: { id: 'v', nom: 'Rouge - Taille M' } }), 1);
  assert.equal(stockDisponibleSelection(produit, { variant: { id: 'v', nom: 'Rouge - Taille L' } }), 0);
});

test('ancien format avec quantite', () => {
  const produit = { quantite_stock: 5, variants: { variants: [{ id: 'x', nom: 'X', quantite: 3 }] } };
  assert.equal(stockDisponibleSelection(produit, { variant: { id: 'x', nom: 'X' } }), 3);
});

test('ancien format options/quantites', () => {
  const produit = { quantite_stock: 9, variants: [{ nom: 'Couleur', options: ['Rouge', 'Bleu'], quantites: [2, 0] }] };
  assert.equal(stockDisponibleSelection(produit, { Couleur: 'Bleu' }), 0);
});

test('sans variant déterminable : stock global', () => {
  assert.equal(stockDisponibleSelection({ quantite_stock: 7, variants: billets }, { variant: { id: 'zz', nom: 'Inconnu' } }), 7);
  assert.equal(stockDisponibleSelection({ quantite_stock: 7 }, null), 7);
});
