import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETRES_PUBLICITE_DEFAUT, parserParametresPublicite, serialiserParametresPublicite } from './publicite.model';

test('paramètres : défauts si table vide', () => {
  assert.deepEqual(parserParametresPublicite([]), PARAMETRES_PUBLICITE_DEFAUT);
});

test('paramètres : booléens, JSON par formule, éligibilité', () => {
  const p = parserParametresPublicite([
    { cle: 'plateforme_active', valeur: 'true' },
    { cle: 'tarifs', valeur: '{"categorie":2000,"accueil":3500,"premium":7000}' },
    { cle: 'garantie_affichages', valeur: '{"accueil":"x"}' },
    { cle: 'eligibilite', valeur: 'toutes' },
    { cle: 'semaines_max', valeur: '8' }
  ]);
  assert.equal(p.plateforme_active, true);
  assert.deepEqual(p.tarifs, { categorie: 2000, accueil: 3500, premium: 7000 });
  assert.deepEqual(p.garantie_affichages, PARAMETRES_PUBLICITE_DEFAUT.garantie_affichages);
  assert.equal(p.eligibilite, 'toutes');
  assert.equal(p.semaines_max, 8);
});

test('paramètres : JSON corrompu et éligibilité inconnue → défaut', () => {
  const p = parserParametresPublicite([
    { cle: 'tarifs', valeur: '{oups' },
    { cle: 'eligibilite', valeur: 'n_importe' }
  ]);
  assert.deepEqual(p.tarifs, PARAMETRES_PUBLICITE_DEFAUT.tarifs);
  assert.equal(p.eligibilite, 'verifiees');
});

test('paramètres : sérialisation aller-retour', () => {
  const entrees = serialiserParametresPublicite({ tarifs: { categorie: 1, accueil: 2, premium: 3 }, kill_switch: true, inconnu: 1 } as never);
  assert.deepEqual(entrees, [
    ['tarifs', '{"categorie":1,"accueil":2,"premium":3}'],
    ['kill_switch', 'true']
  ]);
  const p = parserParametresPublicite(entrees.map(([cle, valeur]) => ({ cle, valeur })));
  assert.equal(p.kill_switch, true);
  assert.equal(p.tarifs.premium, 3);
});
