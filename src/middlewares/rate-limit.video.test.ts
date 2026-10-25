import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { creerLimiteurUploadVideo, LIMITE_UPLOAD_VIDEO_PAR_HEURE } from './rate-limit.middleware';

async function demarrer(max: number) {
  const app = express();
  app.use((req, _res, next) => {
    const id = req.header('x-vendeur');
    if (id) (req as any).vendeur = { id: Number(id) };
    next();
  });
  app.post('/video/upload-url', creerLimiteurUploadVideo(max), (_req, res) => {
    res.json({ success: true });
  });
  const serveur = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/video/upload-url`;
  const appeler = (vendeur?: number) => fetch(url, { method: 'POST', headers: vendeur ? { 'x-vendeur': String(vendeur) } : {} });
  return { serveur, appeler };
}

test('limite par vendeur : la requête au-delà du plafond reçoit 429 TOO_MANY_REQUESTS', async () => {
  const { serveur, appeler } = await demarrer(3);
  try {
    for (let i = 0; i < 3; i += 1) assert.equal((await appeler(7)).status, 200);
    const refusee = await appeler(7);
    assert.equal(refusee.status, 429);
    const corps = (await refusee.json()) as { success: boolean; code: string };
    assert.equal(corps.success, false);
    assert.equal(corps.code, 'TOO_MANY_REQUESTS');
  } finally {
    serveur.close();
  }
});

test('limite par vendeur : un autre vendeur sur la même IP garde son quota', async () => {
  const { serveur, appeler } = await demarrer(2);
  try {
    assert.equal((await appeler(1)).status, 200);
    assert.equal((await appeler(1)).status, 200);
    assert.equal((await appeler(1)).status, 429);
    assert.equal((await appeler(2)).status, 200);
  } finally {
    serveur.close();
  }
});

test('plafond par défaut : 20 URL par heure et par vendeur', () => {
  assert.equal(LIMITE_UPLOAD_VIDEO_PAR_HEURE, 20);
});
