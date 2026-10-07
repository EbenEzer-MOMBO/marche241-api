import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterSemaines,
  bornesPeriode,
  erreurPeriode,
  estLundi,
  lundiCourant,
  semainesPeriode,
  semainesReservables
} from './semaines';

test('lundi courant : mercredi midi → lundi de la semaine', () => {
  assert.equal(lundiCourant(new Date('2026-10-07T12:00:00Z')), '2026-10-05');
});

test('lundi courant : dimanche 23:30 UTC = lundi 00:30 à Libreville → nouvelle semaine', () => {
  assert.equal(lundiCourant(new Date('2026-10-11T23:30:00Z')), '2026-10-12');
});

test('lundi courant : dimanche 22:30 UTC = dimanche 23:30 à Libreville → semaine précédente', () => {
  assert.equal(lundiCourant(new Date('2026-10-11T22:30:00Z')), '2026-10-05');
});

test('estLundi', () => {
  assert.equal(estLundi('2026-10-12'), true);
  assert.equal(estLundi('2026-10-13'), false);
  assert.equal(estLundi('2026-02-30'), false);
  assert.equal(estLundi('n/a'), false);
});

test('bascule d\'année', () => {
  assert.equal(ajouterSemaines('2026-12-28', 1), '2027-01-04');
  assert.deepEqual(semainesPeriode('2026-12-21', 3), ['2026-12-21', '2026-12-28', '2027-01-04']);
});

test('bornes : lundi 00:00 → dimanche 23:59:59.999 heure de Libreville', () => {
  const b = bornesPeriode('2026-10-12', 2);
  assert.equal(b.date_debut.toISOString(), '2026-10-11T23:00:00.000Z');
  assert.equal(b.date_fin.toISOString(), '2026-10-25T22:59:59.999Z');
});

test('semaines réservables : commencent la semaine prochaine', () => {
  assert.deepEqual(semainesReservables(3, new Date('2026-10-07T12:00:00Z')), ['2026-10-12', '2026-10-19', '2026-10-26']);
});

test('période : semaine en cours refusée, semaine prochaine acceptée', () => {
  const maintenant = new Date('2026-10-07T12:00:00Z');
  assert.match(erreurPeriode('2026-10-05', 1, 12, maintenant) ?? '', /entamée/);
  assert.equal(erreurPeriode('2026-10-12', 1, 12, maintenant), null);
});

test('période : semaine en cours acceptée pour l\'équipe', () => {
  const maintenant = new Date('2026-10-07T12:00:00Z');
  assert.equal(erreurPeriode('2026-10-05', 1, 12, maintenant, true), null);
  assert.match(erreurPeriode('2026-09-28', 1, 12, maintenant, true) ?? '', /passée/);
});

test('période : non-lundi, nombre invalide, au-delà de l\'horizon', () => {
  const maintenant = new Date('2026-10-07T12:00:00Z');
  assert.match(erreurPeriode('2026-10-13', 1, 12, maintenant) ?? '', /lundi/);
  assert.match(erreurPeriode('2026-10-12', 0, 12, maintenant) ?? '', /au moins/);
  assert.equal(erreurPeriode('2026-10-12', 12, 12, maintenant), null);
  assert.match(erreurPeriode('2026-10-12', 13, 12, maintenant) ?? '', /à l'avance/);
});
