import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prixUnitaireServeur } from './prix-commande';

const vetement = {
  prix: 10000,
  variants: {
    type: 'vetements',
    variants: [{ id: 'v1', nom: 'Noir', prix: 12000 }, { id: 'v2', nom: 'Beige' }],
    personnalisations: [{ id: 'p1', libelle: 'Prénom', prix_supplementaire: 3000 }]
  }
};

test('prix du variant choisi : le prix envoyé par le client est ignoré', () => {
  assert.equal(prixUnitaireServeur(vetement, { variant: { id: 'v1', nom: 'Noir - Taille M', prix: 1 } }), 12000);
});

test('variant sans prix ou inconnu : prix du produit', () => {
  assert.equal(prixUnitaireServeur(vetement, { variant: { id: 'v2', prix: 1 } }), 10000);
  assert.equal(prixUnitaireServeur(vetement, { variant: { id: 'zzz', prix: 1 } }), 10000);
  assert.equal(prixUnitaireServeur(vetement, null), 10000);
});

test('personnalisation : supplément lu sur le produit, pas sur la sélection du client', () => {
  const sel = { variant: { id: 'v1' }, personnalisations: [{ id: 'p1', prix_supplementaire: 0 }] };
  assert.equal(prixUnitaireServeur(vetement, sel), 15000);
});

test('personnalisation inconnue ou en double : ignorée / comptée une fois', () => {
  const sel = { personnalisations: [{ id: 'p1' }, { id: 'p1' }, { id: 'x', prix_supplementaire: 9999 }] };
  assert.equal(prixUnitaireServeur(vetement, sel), 13000);
});

test('billet : prix du variant par nom, produit sans prix de base', () => {
  const billet = { prix: 0, variants: { variants: [{ id: 'a', nom: 'Billet Argent', prix: 35000 }] } };
  assert.equal(prixUnitaireServeur(billet, { variant: { nom: 'Billet Argent', prix: 1 } }), 35000);
});
