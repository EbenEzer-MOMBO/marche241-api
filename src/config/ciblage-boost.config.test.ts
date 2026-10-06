import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPES_INTERETS, idsMetaInterets, INTERETS_CIBLAGE, VILLES_GABON, clesMetaVilles } from './ciblage-boost.config';

test('catalogue des intérêts : codes uniques, groupes connus, ids Meta numériques sans doublon', () => {
  const codes = INTERETS_CIBLAGE.map((i) => i.code);
  assert.equal(new Set(codes).size, codes.length);
  const groupes = new Set<string>(GROUPES_INTERETS.map((g) => g.code));
  const ids = INTERETS_CIBLAGE.flatMap((i) => i.meta.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const i of INTERETS_CIBLAGE) {
    assert.ok(groupes.has(i.groupe), i.code);
    assert.ok(i.meta.length > 0, i.code);
    for (const m of i.meta) assert.match(m.id, /^\d{10,}$/, i.code);
  }
  for (const g of GROUPES_INTERETS) assert.ok(INTERETS_CIBLAGE.some((i) => i.groupe === g.code), g.code);
});

test('conversion des codes stockés en identifiants Meta', () => {
  assert.deepEqual(clesMetaVilles(['2420605', 'inconnue']), ['800232']);
  assert.deepEqual(idsMetaInterets(['mangas', 'mangas', 'inconnu']), ['6003083357650']);
  for (const v of VILLES_GABON) assert.match(v.meta, /^\d+$/);
});
