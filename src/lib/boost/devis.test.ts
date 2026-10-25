import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetJourMinimum, budgetParJour, devisDepuisMedia, devisDepuisTotal, estTotalDansBornes, totalMinimumPourMedia } from './devis';

test('devisDepuisMedia : commission en % avec minimum', () => {
  assert.deepEqual(devisDepuisMedia(50_000, 2000, 1000), {
    budget_media_fcfa: 50_000,
    commission_bps: 2000,
    commission_fcfa: 10_000,
    frais_video_fcfa: 0,
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

test('budgetJourMinimum : plancher WhatsApp en $US converti au taux, jamais sous le minimum général', () => {
  const p = { budget_jour_min_fcfa: 600, budget_jour_min_whatsapp_usd: 2.2, fx_xaf_par_usd: 600 };
  assert.equal(budgetJourMinimum('trafic', p), 600);
  assert.equal(budgetJourMinimum('notoriete', p), 600);
  assert.equal(budgetJourMinimum('whatsapp', p), 1320);
  // le plancher suit le taux : à 650 FCFA / $US, 2,2 $US = 1 430 FCFA
  assert.equal(budgetJourMinimum('whatsapp', { ...p, fx_xaf_par_usd: 650 }), 1430);
  assert.equal(budgetJourMinimum('whatsapp', { ...p, budget_jour_min_whatsapp_usd: 0 }), 600);
});

test('totalMinimumPourMedia : plus petit total à la centaine couvrant le budget média', () => {
  // 3 jours × 1 300 FCFA = 3 900 FCFA de média, commission 30 % (minimum 1 000)
  const total = totalMinimumPourMedia(3900, 3000, 1000);
  assert.equal(total % 100, 0);
  assert.ok(devisDepuisTotal(total, 3000, 1000).budget_media_fcfa >= 3900);
  assert.ok(devisDepuisTotal(total - 100, 3000, 1000).budget_media_fcfa < 3900);
  // commission au minimum : 500 FCFA de média → 1 500 FCFA
  assert.equal(totalMinimumPourMedia(500, 3000, 1000), 1500);
});

test('frais vidéo : déduit avant la commission, la somme vaut toujours le total', () => {
  for (const total of [7500, 15_000, 30_000, 123_457]) {
    const d = devisDepuisTotal(total, 2000, 1000, 0, 1000);
    assert.equal(d.frais_video_fcfa, 1000);
    assert.equal(d.budget_media_fcfa + d.commission_fcfa + d.frais_video_fcfa + d.tva_fcfa, total);
    // La commission ne porte que sur le média : 20 % du média, frais vidéo exclu
    assert.equal(d.commission_fcfa, Math.max(1000, Math.round(((total - 1000) * 2000) / 12_000)));
  }
  assert.equal(devisDepuisTotal(7500, 2000, 1000, 0, 1000).budget_media_fcfa, 5417);
  assert.equal(devisDepuisTotal(7500, 2000, 1000).frais_video_fcfa, 0);
});

test('frais vidéo avec TVA : somme exacte', () => {
  for (const total of [7500, 9999, 50_000]) {
    const d = devisDepuisTotal(total, 1500, 1000, 1800, 1000);
    assert.equal(d.budget_media_fcfa + d.commission_fcfa + d.frais_video_fcfa + d.tva_fcfa, total);
  }
});

test('frais vidéo : le pack Découverte (3 000) ne laisse presque rien au média, refus sous le plancher', () => {
  const d = devisDepuisTotal(3000, 2000, 1000, 0, 1000);
  assert.equal(d.budget_media_fcfa, 1000);
  assert.throws(() => devisDepuisTotal(2000, 2000, 1000, 0, 1000), /commission minimum de 1000 FCFA et les frais vidéo de 1000 FCFA/);
});

test('devisDepuisMedia avec frais vidéo : total = média + commission + frais', () => {
  const d = devisDepuisMedia(50_000, 2000, 1000, 0, 1000);
  assert.equal(d.frais_video_fcfa, 1000);
  assert.equal(d.total_fcfa, 50_000 + 10_000 + 1000);
});

test('totalMinimumPourMedia : le frais vidéo relève le total minimum, aller-retour cohérent', () => {
  const sans = totalMinimumPourMedia(1800, 2000, 1000);
  const avec = totalMinimumPourMedia(1800, 2000, 1000, 0, 1000);
  assert.ok(avec >= sans + 1000);
  assert.ok(devisDepuisTotal(avec, 2000, 1000, 0, 1000).budget_media_fcfa >= 1800);
  assert.ok(devisDepuisTotal(avec - 100, 2000, 1000, 0, 1000).budget_media_fcfa < 1800);
});
