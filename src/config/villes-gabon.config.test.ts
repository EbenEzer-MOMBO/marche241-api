import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliserVille, VILLES_BOUTIQUE } from './villes-gabon.config';

test('normaliserVille reconnaît les saisies réelles', () => {
  assert.equal(normaliserVille('libreville'), 'Libreville');
  assert.equal(normaliserVille('  Port Gentil '), 'Port-Gentil');
  assert.equal(normaliserVille('AKANDA'), 'Akanda');
  assert.equal(normaliserVille('Gabon Libreville'), 'Libreville');
  assert.equal(normaliserVille('grand libreville'), 'Libreville');
  assert.equal(normaliserVille('libreville centre'), 'Libreville');
  assert.equal(normaliserVille('Lambarene'), 'Lambaréné');
  assert.equal(normaliserVille('Oyem-Ville'), 'Oyem-Ville');
});

test('une ville inconnue est conservée, nettoyée', () => {
  assert.equal(normaliserVille('  Cocobeach  '), 'Cocobeach');
  assert.equal(normaliserVille(null), null);
  assert.equal(normaliserVille(''), '');
  assert.ok(VILLES_BOUTIQUE.includes('Libreville'));
  assert.ok(VILLES_BOUTIQUE.includes('Akanda'));
});
