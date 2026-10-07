import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creneauxPage, lignesReservation } from './creneaux';

test('Premium réserve accueil + pages pour chaque semaine', () => {
  assert.deepEqual(lignesReservation('premium', null, ['2026-10-12', '2026-10-19']), [
    { creneau: 'accueil', categorie_id: null, semaine: '2026-10-12' },
    { creneau: 'pages', categorie_id: null, semaine: '2026-10-12' },
    { creneau: 'accueil', categorie_id: null, semaine: '2026-10-19' },
    { creneau: 'pages', categorie_id: null, semaine: '2026-10-19' }
  ]);
});

test('Accueil et Premium partagent le créneau accueil (blocage mutuel)', () => {
  const accueil = lignesReservation('accueil', null, ['2026-10-12']).map((l) => l.creneau);
  const premium = lignesReservation('premium', null, ['2026-10-12']).map((l) => l.creneau);
  assert.ok(accueil.some((c) => premium.includes(c)));
});

test('Catégorie : créneau lié à la catégorie, obligatoire', () => {
  assert.deepEqual(lignesReservation('categorie', 7, ['2026-10-12']), [{ creneau: 'categorie', categorie_id: 7, semaine: '2026-10-12' }]);
  assert.throws(() => lignesReservation('categorie', null, ['2026-10-12']));
});

test('créneaux par page : au plus deux bannières', () => {
  assert.deepEqual(creneauxPage('accueil', null), [{ creneau: 'accueil', categorie_id: null }]);
  assert.deepEqual(creneauxPage('categorie', 4), [
    { creneau: 'categorie', categorie_id: 4 },
    { creneau: 'pages', categorie_id: null }
  ]);
  assert.deepEqual(creneauxPage('evenements', null), [{ creneau: 'pages', categorie_id: null }]);
  assert.deepEqual(creneauxPage('categorie', null), [{ creneau: 'pages', categorie_id: null }]);
});
