import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFORMITE_BOOST, conformiteRequise, estConformiteComplete, IDS_CONFORMITE } from './conformite-boost.config';

test('checklist vidéo complète uniquement si tout est coché', () => {
  assert.equal(estConformiteComplete(IDS_CONFORMITE, 'video'), true);
  assert.equal(estConformiteComplete(IDS_CONFORMITE.slice(1), 'video'), false);
  assert.equal(estConformiteComplete([], 'video'), false);
});

test('une image n\'exige pas les points propres à la vidéo (sous-titres, droits musicaux)', () => {
  const quatreAnciens = ['interdit', 'allegations', 'ciblage', 'visuel'];
  assert.equal(estConformiteComplete(quatreAnciens, 'image'), true);
  assert.equal(estConformiteComplete(quatreAnciens), true);
  assert.equal(estConformiteComplete(quatreAnciens, null), true);
  assert.equal(estConformiteComplete(quatreAnciens, 'video'), false);
  assert.equal(estConformiteComplete(['interdit', 'ciblage', 'visuel'], 'image'), false);
});

test('conformiteRequise : 4 points pour une image, 6 pour une vidéo', () => {
  assert.deepEqual(
    conformiteRequise('image').map((c) => c.id),
    ['interdit', 'allegations', 'ciblage', 'visuel']
  );
  assert.deepEqual(
    conformiteRequise('video').map((c) => c.id),
    ['interdit', 'allegations', 'ciblage', 'visuel', 'lisible', 'musique']
  );
  assert.equal(conformiteRequise('video'), CONFORMITE_BOOST);
});
