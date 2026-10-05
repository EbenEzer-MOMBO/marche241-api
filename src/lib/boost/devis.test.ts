import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetParJour, devisDepuisMedia, devisDepuisTotal, estTotalDansBornes } from './devis';

test('devisDepuisMedia : commission en % avec minimum', () => {
  assert.deepEqual(devisDepuisMedia(50_000, 2000, 1000), {
    budget_media_fcfa: 50_000,
    commission_bps: 2000,
    commission_fcfa: 10_000,
    tva_bps: 0,
    tva_fcfa: 0,
    total_fcfa: 60_000
  });
  assert.equal(devisDepuisMedia(2000, 2000, 1000).commission_fcfa, 1000);
});

test('devisDepuisMedia : TVA sur média + commission', () => {
  const d = devisDepuisMedia(10_000, 2000, 1000, 1800);
  assert.equal(d.tva_fcfa, Math.round(12_000 * 0.18));
  assert.equal(d.total_fcfa, 12_000 + d.tva_fcfa);
});

test('devisDepuisTotal : packs par défaut (20 %, min 1 000)', () => {
  const attendus: Array<[number, number, number]> = [
    [3000, 2000, 1000],
    [7500, 6250, 1250],
    [15_000, 12_500, 2500],
    [30_000, 25_000, 5000]
  ];
  for (const [total, media, commission] of attendus) {
    const d = devisDepuisTotal(total, 2000, 1000);
    assert.equal(d.budget_media_fcfa, media, `média pour ${total}`);
    assert.equal(d.commission_fcfa, commission, `commission pour ${total}`);
    assert.equal(d.budget_media_fcfa + d.commission_fcfa + d.tva_fcfa, total);
  }
});

test('devisDepuisTotal : la somme vaut toujours le total, avec TVA', () => {
  for (const total of [3000, 3001, 9999, 123_457, 500_000]) {
    const d = devisDepuisTotal(total, 1500, 1000, 1800);
    assert.equal(d.budget_media_fcfa + d.commission_fcfa + d.tva_fcfa, total);
    assert.ok(d.budget_media_fcfa > 0);
  }
});

test('devisDepuisTotal : refuse un total qui ne couvre pas la commission minimum', () => {
  assert.throws(() => devisDepuisTotal(1000, 2000, 1000), /commission minimum/);
});

test('bornes et budget par jour', () => {
  assert.equal(estTotalDansBornes(3000, 3000, 500_000), true);
  assert.equal(estTotalDansBornes(2999, 3000, 500_000), false);
  assert.equal(estTotalDansBornes(3000.5, 3000, 500_000), false);
  assert.equal(budgetParJour(2000, 3), 666);
});
