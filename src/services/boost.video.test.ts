import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoostErreur, preparerVideoPourPublication, BoostService, fraisVideoPour, messageBudgetInsuffisant } from './boost.service';
import { Boost, BoostParametres } from '../lib/database-types';

const parametres = {
  total_min_fcfa: 3000,
  total_max_fcfa: 500_000,
  duree_min_jours: 1,
  duree_max_jours: 60,
  commission_bps: 2000,
  commission_min_fcfa: 1000,
  tva_bps: 0,
  budget_jour_min_fcfa: 500,
  budget_jour_min_whatsapp_usd: 2.2,
  fx_xaf_par_usd: 600
} as BoostParametres;

function boost(partiel: Partial<Boost>): Boost {
  return {
    id: 1,
    boutique_id: 1,
    vendeur_id: 1,
    type_cible: 'boutique',
    produit_id: null,
    objectif: 'trafic',
    statut: 'brouillon',
    nom: 'Test',
    budget_media_fcfa: 6000,
    commission_bps: 2000,
    commission_fcfa: 1500,
    tva_fcfa: 0,
    frais_encaissement_fcfa: 0,
    total_fcfa: 7500,
    depense_fcfa: 0,
    duree_jours: 5,
    date_debut: null,
    date_fin: null,
    ciblage: { pays: ['GA'], villes: [], age_min: 18, age_max: 65, sexes: [], langues: [], interets: [] },
    url_destination: 'https://marche241.ga/x',
    whatsapp_e164: null,
    titre: 'Titre ok',
    texte_principal: 'Texte de pub',
    description: null,
    image_url: 'https://cdn.test/mini.jpg',
    media_type: 'image',
    video_url: null,
    video_duree_sec: null,
    meta_video_id: null,
    cta: 'SHOP_NOW',
    note_revue: null,
    conformite: null,
    valide_par: null,
    date_validation: null,
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_ad_id: null,
    meta_page_id: null,
    meta_page_nom: null,
    meta_instagram_id: null,
    meta_instagram_nom: null,
    meta_statut_effectif: null,
    meta_derniere_erreur: null,
    dry_run: false,
    date_derniere_synchro: null,
    statut_remboursement: 'aucun',
    montant_a_rembourser_fcfa: 0,
    date_remboursement: null,
    note_remboursement: null,
    date_soumission: null,
    date_paiement: null,
    date_cloture: null,
    date_creation: new Date(),
    date_modification: new Date(),
    ...partiel
  };
}

test('soumission vidéo : miniature et vidéo obligatoires', () => {
  const erreurs = BoostService.validerPourSoumission(
    boost({ media_type: 'video', image_url: null, video_url: null, video_duree_sec: null }),
    parametres
  );
  assert.ok(erreurs.some((e) => e.field === 'image_url'));
  assert.ok(erreurs.some((e) => e.field === 'video_url'));
  assert.ok(erreurs.some((e) => e.field === 'video_duree_sec'));
});

test('soumission image : video_url non exigée', () => {
  const erreurs = BoostService.validerPourSoumission(boost({}), parametres);
  assert.equal(erreurs.some((e) => e.field === 'video_url'), false);
});

test('préparer vidéo image : rien à faire', async () => {
  const id = await preparerVideoPourPublication(boost({}));
  assert.equal(id, null);
});

test('préparer vidéo : téléverse, sauve, attend ready', async () => {
  const sauves: string[] = [];
  const id = await preparerVideoPourPublication(boost({ media_type: 'video', video_url: 'https://cdn.test/boosts/x/v.mp4' }), {
    televerser: async () => 'vid_1',
    attendre: async () => 'ready',
    sauverId: async (_boostId, videoId) => {
      sauves.push(videoId);
    }
  });
  assert.equal(id, 'vid_1');
  assert.deepEqual(sauves, ['vid_1']);
});

test('préparer vidéo : VIDEO_EN_TRAITEMENT sans re-téléverser si meta_video_id déjà là', async () => {
  let televersements = 0;
  await assert.rejects(
    () =>
      preparerVideoPourPublication(boost({ media_type: 'video', video_url: 'https://cdn.test/v.mp4', meta_video_id: 'vid_existant' }), {
        televerser: async () => {
          televersements += 1;
          return 'nouveau';
        },
        attendre: async () => 'processing'
      }),
    (err: unknown) => err instanceof BoostErreur && err.code === 'VIDEO_EN_TRAITEMENT' && err.statusHttp === 409
  );
  assert.equal(televersements, 0);
});

test('préparer vidéo : reprise après traitement, sans re-téléverser', async () => {
  const id = await preparerVideoPourPublication(
    boost({ media_type: 'video', video_url: 'https://cdn.test/v.mp4', meta_video_id: 'vid_existant' }),
    {
      televerser: async () => {
        throw new Error('ne doit pas téléverser');
      },
      attendre: async () => 'ready'
    }
  );
  assert.equal(id, 'vid_existant');
});

test('fraisVideoPour : seulement pour une créa vidéo', () => {
  const p = { frais_video_fcfa: 1000 };
  assert.equal(fraisVideoPour('video', p), 1000);
  assert.equal(fraisVideoPour('image', p), 0);
  assert.equal(fraisVideoPour(null, p), 0);
  assert.equal(fraisVideoPour(undefined, p), 0);
  assert.equal(fraisVideoPour('video', { frais_video_fcfa: -5 }), 0);
});

test('messageBudgetInsuffisant : le frais vidéo réduit le média et le signale', () => {
  // 3 000 FCFA sur 3 jours : suffisant en image (2 000 de média = 666/jour), pas en vidéo (1 000 = 333/jour)
  const p = { ...parametres, budget_jour_min_fcfa: 600, frais_video_fcfa: 1000 } as BoostParametres;
  assert.equal(messageBudgetInsuffisant(3000, 3, 'trafic', p, 0), null);
  const message = messageBudgetInsuffisant(3000, 3, 'trafic', p, 1000);
  assert.match(message ?? '', /dont 1 000 FCFA de frais vidéo/);
  assert.equal(messageBudgetInsuffisant(7500, 3, 'trafic', p, 1000), null);
});

test('soumission vidéo : le devis figé contient le frais vidéo, jamais pour une image', () => {
  const p = { ...parametres, budget_jour_min_fcfa: 600, frais_video_fcfa: 1000 } as BoostParametres;
  const erreurs = BoostService.validerPourSoumission(
    boost({ media_type: 'video', video_url: 'https://cdn.test/boosts/b/v.mp4', image_url: 'https://cdn.test/m.jpg', total_fcfa: 3000, duree_jours: 3 }),
    p
  );
  assert.ok(erreurs.some((e) => /frais vidéo/.test(e.message)), 'le 3 000 FCFA en vidéo est refusé');
  const erreursImage = BoostService.validerPourSoumission(
    boost({ media_type: 'image', image_url: 'https://cdn.test/m.jpg', total_fcfa: 3000, duree_jours: 3 }),
    p
  );
  assert.ok(!erreursImage.some((e) => /frais vidéo/.test(e.message)));
});
