import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterUtmBoost, estDestinationMarche241 } from './utm';

test('ajoute les UTM boost en conservant les paramètres existants', () => {
  const url = new URL(ajouterUtmBoost('https://marche241.ga/ma-boutique?ref=x', 42));
  assert.equal(url.searchParams.get('ref'), 'x');
  assert.equal(url.searchParams.get('utm_source'), 'facebook');
  assert.equal(url.searchParams.get('utm_medium'), 'marche241_boost');
  assert.equal(url.searchParams.get('utm_campaign'), 'boost_42');
});

test('reconnaît une destination Marché 241', () => {
  assert.equal(estDestinationMarche241('https://marche241.ga/x'), true);
  assert.equal(estDestinationMarche241('https://www.marche241.ga/x'), true);
  assert.equal(estDestinationMarche241('http://localhost:3000/x', 'http://localhost:3000'), true);
  assert.equal(estDestinationMarche241('https://exemple.com'), false);
  assert.equal(estDestinationMarche241('pas une url'), false);
  assert.equal(estDestinationMarche241(null), false);
});
