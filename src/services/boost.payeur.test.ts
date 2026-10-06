import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomPayeur } from './boost.service';

test('nom du payeur eBilling : le prénom n’est jamais vide', () => {
  assert.deepEqual(nomPayeur('Eben Ezer Mombo'), { prenom: 'Eben', nom: 'Ezer Mombo' });
  assert.deepEqual(nomPayeur('  Awa  '), { prenom: 'Awa', nom: 'Awa' });
  assert.deepEqual(nomPayeur(null), { prenom: 'Vendeur', nom: 'Marché 241' });
  assert.deepEqual(nomPayeur(''), { prenom: 'Vendeur', nom: 'Marché 241' });
});
