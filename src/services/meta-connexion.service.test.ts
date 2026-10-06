import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { configDepuis, decouvrir, evaluerConnexion, MetaConfig, normaliserDecouverte } from './meta-connexion.service';
import { MetaConnexion } from '../lib/database-types';

const ENV = ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN', 'META_DRY_RUN'];
const envInitial: Record<string, string | undefined> = {};
const fetchInitial = globalThis.fetch;

beforeEach(() => {
  for (const k of ENV) envInitial[k] = process.env[k];
  process.env.META_APP_ID = 'app';
  process.env.META_APP_SECRET = 'secret';
  process.env.META_ACCESS_TOKEN = 'jeton';
});

afterEach(() => {
  for (const k of ENV) {
    if (envInitial[k] === undefined) delete process.env[k];
    else process.env[k] = envInitial[k];
  }
  globalThis.fetch = fetchInitial;
});

const verifiee: MetaConnexion = {
  id: 1,
  ad_account_id: '123',
  ad_account_nom: 'Compte',
  devise: 'USD',
  fuseau: 'Africa/Libreville',
  statut_compte: 1,
  page_id: '456',
  page_nom: 'Page',
  instagram_id: '789',
  instagram_nom: 'marche241',
  jeton_valide: true,
  jeton_permissions: ['ads_management'],
  jeton_expire_le: null,
  verifie_le: new Date(),
  message_erreur: null,
  modifie_par: null,
  date_modification: new Date()
};

const config = (connexion: MetaConnexion | null): MetaConfig => configDepuis(connexion);

test('normaliserDecouverte : un seul compte actif et une seule Page → suggestion', () => {
  const d = normaliserDecouverte(
    [
      { id: 'act_123', account_id: '123', name: 'Compte', currency: 'usd', timezone_name: 'Africa/Libreville', account_status: 1 },
      { id: 'act_999', account_id: '999', name: 'Ancien', currency: 'EUR', account_status: 2 }
    ],
    [{ id: '456', name: 'Page', instagram_business_account: { id: '789', username: 'marche241' } }]
  );
  assert.equal(d.comptes.length, 2);
  assert.deepEqual(d.comptes[0], { id: '123', nom: 'Compte', devise: 'USD', fuseau: 'Africa/Libreville', statut: 1, actif: true });
  assert.equal(d.comptes[1].actif, false);
  assert.deepEqual(d.pages[0].instagram, { id: '789', nom: 'marche241' });
  assert.deepEqual(d.suggestion, { ad_account_id: '123', page_id: '456' });
});

test('normaliserDecouverte : plusieurs Pages ou aucune → pas de suggestion de Page', () => {
  const plusieurs = normaliserDecouverte([{ account_id: '1', account_status: 1 }], [{ id: 'a' }, { id: 'b' }]);
  assert.equal(plusieurs.suggestion.page_id, null);
  assert.equal(plusieurs.pages[0].instagram, null);
  const aucune = normaliserDecouverte(undefined, undefined);
  assert.deepEqual(aucune, { comptes: [], pages: [], suggestion: { ad_account_id: null, page_id: null } });
});

test('evaluerConnexion : prête quand tout est vérifié', () => {
  assert.deepEqual(evaluerConnexion(config(verifiee)), { prete: true, raisons: [] });
});

test('evaluerConnexion : secrets manquants et rien de choisi', () => {
  delete process.env.META_APP_SECRET;
  const e = evaluerConnexion(config(null));
  assert.equal(e.prete, false);
  assert.match(e.raisons.join('|'), /META_APP_SECRET/);
  assert.match(e.raisons.join('|'), /Aucun compte publicitaire/);
  assert.match(e.raisons.join('|'), /Aucune Page/);
});

test('evaluerConnexion : jeton invalide, permission absente, compte désactivé, jamais vérifiée', () => {
  assert.match(evaluerConnexion(config({ ...verifiee, jeton_valide: false })).raisons.join(), /Jeton Meta invalide/);
  assert.match(evaluerConnexion(config({ ...verifiee, jeton_permissions: ['pages_show_list'] })).raisons.join(), /ads_management/);
  assert.match(evaluerConnexion(config({ ...verifiee, statut_compte: 2 })).raisons.join(), /non actif/);
  assert.match(evaluerConnexion(config({ ...verifiee, verifie_le: null })).raisons.join(), /jamais vérifiée/);
});

test('decouvrir : interroge me/adaccounts et me/accounts avec appsecret_proof', async () => {
  const chemins: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    chemins.push(url.pathname);
    assert.ok(url.searchParams.get('appsecret_proof'));
    const data = url.pathname.endsWith('/me/adaccounts')
      ? [{ account_id: '123', name: 'Compte', currency: 'XAF', account_status: 1 }]
      : [{ id: '456', name: 'Page' }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  const d = await decouvrir();
  assert.equal(chemins.length, 2);
  assert.deepEqual(d.suggestion, { ad_account_id: '123', page_id: '456' });
});

test('decouvrir : secrets manquants → 409 sans appel Meta', async () => {
  delete process.env.META_ACCESS_TOKEN;
  let appels = 0;
  globalThis.fetch = (async () => {
    appels += 1;
    return new Response('{}');
  }) as typeof fetch;
  await assert.rejects(() => decouvrir(), (err: any) => err.code === 'META_SECRETS_MANQUANTS' && err.statusHttp === 409);
  assert.equal(appels, 0);
});
