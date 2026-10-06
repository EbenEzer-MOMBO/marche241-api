import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  construireTargeting,
  depenseVersFcfa,
  fcfaVersMontantMineur,
  lireInsights,
  lireStatutPublicite,
  normaliserStatutEffectif,
  objectifMeta,
  parserInsights,
  publierBoost,
  PublicationInput
} from './meta-ads.service';
import { definirMetaConfigPourTests } from './meta-connexion.service';
import { MetaConnexion } from '../lib/database-types';

const fetchInitial = globalThis.fetch;

type Appel = { method: string; path: string; body: Record<string, string>; query: Record<string, string> };
let appels: Appel[] = [];

function installerFetch(devise = 'XAF') {
  let compteur = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const path = url.pathname.replace(/^\/v[\d.]+\//, '');
    const method = init?.method ?? 'GET';
    const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
    const query = Object.fromEntries(url.searchParams);
    appels.push({ method, path, body, query });
    let json: unknown = { success: true };
    if (method === 'GET' && path.startsWith('act_')) json = { currency: devise };
    else if (method === 'GET' && path === 'search') json = { data: [{ key: `geo_${query.q}`, id: `int_${query.q}`, country_code: 'GA' }] };
    else if (method === 'POST' && /\/(campaigns|adsets|ads)$/.test(path)) json = { id: `id_${++compteur}` };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

const input: PublicationInput = {
  nom: 'M241 · boost_1 · ma-boutique',
  objectif: 'trafic',
  budgetMediaFcfa: 25_000,
  dureeJours: 7,
  ciblage: { pays: ['GA'], villes: ['2420605'], age_min: 20, age_max: 45, sexes: ['femme'], langues: ['6'], interets: ['mode'] },
  urlDestination: 'https://marche241.ga/ma-boutique?utm_campaign=boost_1',
  whatsappE164: null,
  texte: 'Découvrez nos nouveautés',
  titre: 'Ma boutique',
  imageUrl: 'https://cdn.marche241.ga/x.jpg',
  fxXafParUsd: 600
};

/** Connexion vérifiée et prête (ligne meta_connexion simulée). */
const connexionPrete: MetaConnexion = {
  id: 1,
  ad_account_id: '999',
  ad_account_nom: 'Compte test',
  devise: 'XAF',
  fuseau: 'Africa/Libreville',
  statut_compte: 1,
  page_id: 'page_1',
  page_nom: 'Page test',
  instagram_id: null,
  instagram_nom: null,
  jeton_valide: true,
  jeton_permissions: ['ads_management', 'pages_read_engagement'],
  jeton_expire_le: null,
  verifie_le: new Date(),
  message_erreur: null,
  modifie_par: null,
  date_modification: new Date()
};

beforeEach(() => {
  appels = [];
});

afterEach(() => {
  definirMetaConfigPourTests(null);
  globalThis.fetch = fetchInitial;
});

function configurerMetaReel(devise = 'XAF') {
  definirMetaConfigPourTests({
    dryRun: false,
    appSecret: 'secret-test',
    devise,
    connexion: { ...connexionPrete, devise }
  });
}

test('conversions de devise', () => {
  assert.equal(fcfaVersMontantMineur(25_000, 'XAF', 600), 25_000);
  assert.equal(fcfaVersMontantMineur(6000, 'USD', 600), 1000);
  assert.equal(fcfaVersMontantMineur(655.957, 'EUR', 600), 100);
  assert.equal(fcfaVersMontantMineur(10, 'USD', 600), 100, 'minimum 1 USD');
  assert.equal(depenseVersFcfa(12.5, 'USD', 600), 7500);
  assert.equal(depenseVersFcfa(1234, 'XAF', 600), 1234);
});

test('correspondance des objectifs', () => {
  assert.equal(objectifMeta('trafic').objective, 'OUTCOME_TRAFFIC');
  assert.equal(objectifMeta('whatsapp').optimization_goal, 'CONVERSATIONS');
  assert.equal(objectifMeta('notoriete').objective, 'OUTCOME_AWARENESS');
});

test('targeting : villes prioritaires sur pays, un seul sexe, intérêts', () => {
  const t = construireTargeting(input.ciblage, ['k1'], ['i1']);
  assert.deepEqual(t.geo_locations, { cities: [{ key: 'k1', radius: 25, distance_unit: 'kilometer' }] });
  assert.deepEqual(t.genders, [2]);
  assert.deepEqual(t.locales, [6]);
  assert.deepEqual(t.flexible_spec, [{ interests: [{ id: 'i1' }] }]);
  assert.deepEqual(t.targeting_automation, { advantage_audience: 0 });
  const sansVille = construireTargeting({ ...input.ciblage, sexes: ['homme', 'femme'], pays: [] }, [], []);
  assert.deepEqual(sansVille.geo_locations, { countries: ['GA'] });
  assert.equal(sansVille.genders, undefined);
});

test('mode simulé : aucun appel réseau, identifiants dry_*', async () => {
  definirMetaConfigPourTests({ dryRun: true });
  installerFetch();
  const r = await publierBoost(input);
  assert.equal(r.dryRun, true);
  assert.match(r.campaignId, /^dry_campaign_/);
  assert.equal(appels.length, 0);
});

test('publication réelle : ordre des appels, PAUSED puis ACTIVE, budget en XAF', async () => {
  configurerMetaReel();
  installerFetch('XAF');
  const r = await publierBoost(input);
  assert.equal(r.dryRun, false);
  const posts = appels.filter((a) => a.method === 'POST');
  assert.deepEqual(posts.map((a) => a.path), ['act_999/campaigns', 'act_999/adsets', 'act_999/ads', r.campaignId, r.adSetId, r.adId]);
  assert.equal(posts[0].body.status, 'PAUSED');
  assert.equal(posts[0].body.objective, 'OUTCOME_TRAFFIC');
  assert.equal(posts[0].body.access_token, 'jeton-test');
  assert.match(posts[0].body.appsecret_proof, /^[0-9a-f]{64}$/);
  const adset = posts[1].body;
  assert.equal(adset.lifetime_budget, '25000');
  assert.equal(adset.destination_type, 'WEBSITE');
  assert.equal(adset.promoted_object, undefined);
  assert.deepEqual(JSON.parse(adset.targeting).geo_locations.cities[0].key, 'geo_Libreville');
  assert.deepEqual(JSON.parse(adset.targeting).flexible_spec, [{ interests: [{ id: 'int_Fashion' }] }]);
  const creative = JSON.parse(posts[2].body.creative);
  assert.equal(creative.object_story_spec.page_id, 'page_1');
  assert.equal(creative.object_story_spec.link_data.link, input.urlDestination);
  assert.equal(creative.object_story_spec.link_data.call_to_action.type, 'SHOP_NOW');
  for (const p of posts.slice(3)) assert.equal(p.body.status, 'ACTIVE');
});

test('publication WhatsApp : lien wa.me et promoted_object page', async () => {
  configurerMetaReel('USD');
  installerFetch('USD');
  await publierBoost({ ...input, objectif: 'whatsapp', whatsappE164: '+241 77 00 00 00', urlDestination: null });
  const posts = appels.filter((a) => a.method === 'POST');
  assert.equal(posts[1].body.destination_type, 'WHATSAPP');
  assert.deepEqual(JSON.parse(posts[1].body.promoted_object), { page_id: 'page_1' });
  assert.equal(posts[1].body.lifetime_budget, String(Math.round((25_000 / 600) * 100)));
  const creative = JSON.parse(posts[2].body.creative);
  assert.equal(creative.object_story_spec.link_data.link, 'https://wa.me/24177000000');
});

test('erreur Meta remontée avec le message lisible', async () => {
  configurerMetaReel();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: 'tech', error_user_msg: 'Budget trop faible' } }), { status: 400 })) as typeof fetch;
  await assert.rejects(() => publierBoost(input), /Budget trop faible/);
});

test('insights : time_range + time_increment=1 et parsing', async () => {
  configurerMetaReel();
  globalThis.fetch = (async (url: string | URL) => {
    appels.push({ method: 'GET', path: String(url), body: {}, query: Object.fromEntries(new URL(String(url)).searchParams) });
    return new Response(
      JSON.stringify({
        data: [
          { date_start: '2026-10-01', spend: '1200', impressions: '3000', reach: '2500', inline_link_clicks: '40' },
          { date_start: '2026-10-02', spend: '800', impressions: '2000', reach: '1800', clicks: '30', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }] }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;
  const rows = await lireInsights('cmp_1', '2026-10-01', '2026-10-02');
  assert.equal(appels[0].query.time_increment, '1');
  assert.deepEqual(JSON.parse(appels[0].query.time_range), { since: '2026-10-01', until: '2026-10-02' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].clics, 40);
  assert.equal(rows[1].messages, 5);
});

test('insights ignorés pour un boost simulé', async () => {
  configurerMetaReel();
  installerFetch();
  assert.deepEqual(await lireInsights('dry_campaign_x', '2026-10-01', '2026-10-02'), []);
  assert.equal(appels.length, 0);
});

test('statut effectif de la publicité', async () => {
  assert.equal(normaliserStatutEffectif('DISAPPROVED'), 'rejete');
  assert.equal(normaliserStatutEffectif('PENDING_REVIEW'), 'en_revue');
  assert.equal(normaliserStatutEffectif('ACTIVE'), 'actif');
  configurerMetaReel();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ effective_status: 'DISAPPROVED', ad_review_feedback: { global: { 'Contenu interdit': 'Produit non autorisé' } } }), { status: 200 })) as typeof fetch;
  const s = await lireStatutPublicite('ad_1');
  assert.equal(s.statut, 'rejete');
  assert.match(s.motif ?? '', /Produit non autorisé/);
});

test('parserInsights ignore les lignes sans date', () => {
  assert.deepEqual(parserInsights([{ spend: '1' }]), []);
  assert.deepEqual(parserInsights(undefined), []);
});

test('hors mode simulé, une connexion incomplète bloque la publication (pas de simulation silencieuse)', async () => {
  definirMetaConfigPourTests({ dryRun: false, appSecret: 'secret-test', pageId: '', connexion: { ...connexionPrete, page_id: null } });
  installerFetch();
  await assert.rejects(() => publierBoost(input), (err: any) => err.code === 'META_NON_CONFIGURE' && err.statusHttp === 409);
  assert.equal(appels.length, 0);
});
