import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireInsertionCommande } from './insertion-commande';
import { TAUX_MARGE_DEFAUT } from './marge';

const colonnes = ['numero_commande', 'boutique_id', 'total'];
const placeholders = ['$1', '$2', '$3'];
const valeurs = ['CMD-0001', 229, 20_400];

test('construireInsertionCommande : la boutique est le dernier paramètre, référencé par $N+1', () => {
  const { text, params } = construireInsertionCommande(colonnes, placeholders, valeurs, 229);

  assert.deepEqual(params, ['CMD-0001', 229, 20_400, 229]);
  assert.match(text, /WHERE b\.id = \$4\)/);
});

test('construireInsertionCommande : le taux vient du vendeur de la boutique, 10 par défaut', () => {
  const { text } = construireInsertionCommande(colonnes, placeholders, valeurs, 229);

  assert.match(text, /SELECT v\.taux_marge FROM boutiques b JOIN vendeurs v ON v\.id = b\.vendeur_id/);
  assert.ok(text.includes(`COALESCE(`));
  assert.ok(text.includes(`${TAUX_MARGE_DEFAUT}\n           )`));
});

test('construireInsertionCommande : taux_marge est une colonne insérée en plus de la liste blanche', () => {
  const { text } = construireInsertionCommande(colonnes, placeholders, valeurs, 229);

  assert.match(text, /INSERT INTO commandes \(numero_commande, boutique_id, total, taux_marge, date_commande, date_modification\)/);
  // 3 placeholders de la liste blanche + la valeur calculée + NOW(), NOW()
  assert.match(text, /\$1, \$2, \$3,\s+COALESCE/);
});

test('construireInsertionCommande : ne modifie pas les valeurs fournies', () => {
  const copie = [...valeurs];
  construireInsertionCommande(colonnes, placeholders, valeurs, 229);

  assert.deepEqual(valeurs, copie);
});
