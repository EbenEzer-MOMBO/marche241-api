import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimerAudience, estimerImpressionsJour, impressionsDepuisCpm } from './meta-estimation.service';

test('impressions depuis une fourchette de CPM', () => {
  assert.deepEqual(impressionsDepuisCpm(1000, 46, 85), { min: Math.round((1000 / 85) * 1000), max: Math.round((1000 / 46) * 1000) });
  assert.deepEqual(impressionsDepuisCpm(1000, 85, 46), impressionsDepuisCpm(1000, 46, 85));
  assert.deepEqual(impressionsDepuisCpm(0, 46, 85), { min: null, max: null });
});

test('mode simulé : fourchette par défaut et audience indisponible', async () => {
  const avant = process.env.META_DRY_RUN;
  process.env.META_DRY_RUN = 'true';
  try {
    const [e] = await estimerImpressionsJour([666], { cpmMinFcfa: 46, cpmMaxFcfa: 85, fxXafParUsd: 600 });
    assert.equal(e.source, 'defaut');
    assert.equal(e.min, Math.round((666 / 85) * 1000));
    const a = await estimerAudience({ pays: ['GA'], villes: [], age_min: 18, age_max: 65, sexes: [], langues: [], interets: [] });
    assert.equal(a.disponible, false);
  } finally {
    if (avant === undefined) delete process.env.META_DRY_RUN;
    else process.env.META_DRY_RUN = avant;
  }
});
