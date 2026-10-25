import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORAGE_ENDPOINT = 'https://compte.r2.cloudflarestorage.com';
process.env.STORAGE_ACCESS_KEY_ID = 'cle-test';
process.env.STORAGE_SECRET_ACCESS_KEY = 'secret-test';
process.env.STORAGE_BUCKET = 'bucket-test';
process.env.STORAGE_PUBLIC_URL = 'https://cdn.test';

test('URL présignée vidéo : la taille est signée (content-length) et le type aussi', async () => {
  const { creerUrlTeleversementVideo } = await import('./storage.utils');
  const taille = 4_681_373;
  const r = await creerUrlTeleversementVideo('ma-boutique', 'video/mp4', taille);

  const url = new URL(r.urlPut);
  const signes = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
  // Exactement ces en-têtes : la taille et le type sont imposés à R2, rien d'autre n'est exigé du navigateur
  assert.deepEqual([...signes].sort(), ['content-length', 'content-type', 'host']);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
  assert.match(r.chemin, /^boosts\/ma-boutique\/video_\d+_[0-9a-f]{8}\.mp4$/);
  assert.equal(r.urlPublique, `https://cdn.test/${r.chemin}`);
});

test('URL présignée vidéo : deux tailles donnent deux signatures différentes', async () => {
  const { creerUrlTeleversementVideo } = await import('./storage.utils');
  const a = await creerUrlTeleversementVideo('ma-boutique', 'video/quicktime', 1000);
  const b = await creerUrlTeleversementVideo('ma-boutique', 'video/quicktime', 2000);
  assert.match(a.chemin, /\.mov$/);
  assert.notEqual(new URL(a.urlPut).searchParams.get('X-Amz-Signature'), new URL(b.urlPut).searchParams.get('X-Amz-Signature'));
});
