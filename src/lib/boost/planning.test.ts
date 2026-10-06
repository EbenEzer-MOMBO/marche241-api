import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenetrePublication, planningDepuisDuree } from './planning';

const maintenant = new Date('2026-10-05T10:00:00Z');

test('planning : début dans 1 h, fin après la durée', () => {
  const p = planningDepuisDuree(3, maintenant);
  assert.equal(p.date_debut.toISOString(), '2026-10-05T11:00:00.000Z');
  assert.equal(p.date_fin.toISOString(), '2026-10-08T11:00:00.000Z');
});

test('fenêtre Meta : début >= maintenant + 2 min, durée conservée', () => {
  const f = fenetrePublication(7, maintenant);
  assert.equal(f.start_time, '2026-10-05T10:02:00.000Z');
  assert.equal(f.end_time, '2026-10-12T10:02:00.000Z');
});
