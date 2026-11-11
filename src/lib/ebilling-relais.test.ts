import test from 'node:test';
import assert from 'node:assert/strict';
import { viaRelaisEbilling } from './ebilling-relais';

function avecEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const avant = { url: process.env.EBILLING_RELAY_URL, cle: process.env.EBILLING_RELAY_KEY };
  process.env.EBILLING_RELAY_URL = env.url as string;
  process.env.EBILLING_RELAY_KEY = env.cle as string;
  if (env.url === undefined) delete process.env.EBILLING_RELAY_URL;
  if (env.cle === undefined) delete process.env.EBILLING_RELAY_KEY;
  try {
    fn();
  } finally {
    if (avant.url === undefined) delete process.env.EBILLING_RELAY_URL; else process.env.EBILLING_RELAY_URL = avant.url;
    if (avant.cle === undefined) delete process.env.EBILLING_RELAY_KEY; else process.env.EBILLING_RELAY_KEY = avant.cle;
  }
}

const cible = 'https://staging.billing-easy.net/shap/api/v1/merchant/create-invoice';

test('sans relais : requête inchangée', () => {
  avecEnv({}, () => {
    const req = { url: cible, headers: { Authorization: 'Bearer abc' } };
    assert.deepEqual(viaRelaisEbilling(req), req);
  });
});

test('avec relais : cible et Bearer déplacés dans les en-têtes X-Relay-*', () => {
  avecEnv({ url: 'https://eventime.example/internal/ebilling-relay', cle: 'k' }, () => {
    const res = viaRelaisEbilling({
      url: cible,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc' },
    });
    assert.equal(res.url, 'https://eventime.example/internal/ebilling-relay');
    assert.equal(res.headers['X-Relay-Target'], cible);
    assert.equal(res.headers['X-Relay-Key'], 'k');
    assert.equal(res.headers['X-Relay-Authorization'], 'Bearer abc');
    assert.equal(res.headers['Content-Type'], 'application/json');
    assert.equal(res.headers.Authorization, undefined);
  });
});

test('avec relais : auth Basic convertie en en-tête, pas envoyée en clair', () => {
  avecEnv({ url: 'https://eventime.example/r', cle: 'k' }, () => {
    const res = viaRelaisEbilling({
      url: 'https://stg.billing-easy.com/api/v1/merchant/e_bills/1',
      headers: { Accept: '*/*' },
      auth: { username: 'u', password: 'p' },
    });
    assert.equal(res.auth, undefined);
    assert.equal(res.headers['X-Relay-Authorization'], `Basic ${Buffer.from('u:p').toString('base64')}`);
    assert.equal(res.headers['X-Relay-Accept'], '*/*');
  });
});

test('relais en http ou sans clé : erreur', () => {
  avecEnv({ url: 'http://eventime.example/r', cle: 'k' }, () => {
    assert.throws(() => viaRelaisEbilling({ url: cible, headers: {} }), /https/);
  });
  avecEnv({ url: 'https://eventime.example/r' }, () => {
    assert.throws(() => viaRelaisEbilling({ url: cible, headers: {} }), /EBILLING_RELAY_KEY/);
  });
});
