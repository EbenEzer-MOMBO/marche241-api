import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoostErreur, preparerVideoPourPublication, BoostService, fraisVideoPour, messageBudgetInsuffisant, supprimerVideoR2 } from './boost.service';
import { BoostModel } from '../models/boost.model';
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

test("vidéo rejetée par Meta : l'identifiant est effacé, la relance renvoie le fichier", async () => {
  const efface: number[] = [];
  const sauves: string[] = [];
  let versBase: string | null = 'vid_rejetee';
  const deps = {
    attendre: async (videoId: string) => (videoId === 'vid_rejetee' ? ('error' as const) : ('ready' as const)),
    televerser: async () => 'vid_neuve',
    sauverId: async (_id: number, videoId: string) => {
      versBase = videoId;
      sauves.push(videoId);
    },
    effacerId: async (id: number) => {
      efface.push(id);
      versBase = null;
    }
  };
  await assert.rejects(
    () => preparerVideoPourPublication(boost({ id: 9, media_type: 'video', video_url: 'https://cdn.test/boosts/x/v.mp4', meta_video_id: versBase }), deps),
    (err: any) => err.name === 'MetaGraphError' || /rejeté/.test(err.message)
  );
  assert.deepEqual(efface, [9]);
  assert.equal(versBase, null);

  // Deuxième tentative de l'admin : l'identifiant n'existe plus, la vidéo est téléversée de nouveau
  const id = await preparerVideoPourPublication(boost({ id: 9, media_type: 'video', video_url: 'https://cdn.test/boosts/x/v.mp4', meta_video_id: versBase }), deps);
  assert.equal(id, 'vid_neuve');
  assert.deepEqual(sauves, ['vid_neuve']);
});

test("vidéo encore en traitement : l'identifiant est conservé (reprise sans re-téléverser)", async () => {
  const efface: number[] = [];
  await assert.rejects(
    () =>
      preparerVideoPourPublication(boost({ id: 4, media_type: 'video', video_url: 'https://cdn.test/boosts/x/v.mp4', meta_video_id: 'vid_en_cours' }), {
        attendre: async () => 'processing',
        effacerId: async (id) => {
          efface.push(id);
        }
      }),
    (err: any) => err instanceof BoostErreur && err.code === 'VIDEO_EN_TRAITEMENT'
  );
  assert.deepEqual(efface, []);
});

async function avecBaseStockage<T>(fn: () => Promise<T>): Promise<T> {
  const avant = process.env.STORAGE_PUBLIC_URL;
  process.env.STORAGE_PUBLIC_URL = 'https://cdn.test';
  try {
    return await fn();
  } finally {
    if (avant === undefined) delete process.env.STORAGE_PUBLIC_URL;
    else process.env.STORAGE_PUBLIC_URL = avant;
  }
}

test('supprimerVideoR2 : supprime seulement une vidéo de boost, jamais un autre fichier', () =>
  avecBaseStockage(async () => {
    const supprimes: string[] = [];
    const supprimer = async (chemin: string) => {
      supprimes.push(chemin);
      return { success: true };
    };
    assert.equal(await supprimerVideoR2('https://cdn.test/boosts/ma-boutique/video_1_ab.mp4', supprimer), true);
    assert.equal(await supprimerVideoR2('https://cdn.test/boosts/ma-boutique/miniature.jpg', supprimer), false);
    assert.equal(await supprimerVideoR2('https://cdn.test/produits/ma-boutique/photo.mp4', supprimer), false);
    assert.equal(await supprimerVideoR2('https://autre.test/boosts/ma-boutique/video.mp4', supprimer), false);
    assert.equal(await supprimerVideoR2(null, supprimer), false);
    assert.deepEqual(supprimes, ['boosts/ma-boutique/video_1_ab.mp4']);
  }));

test('supprimerVideoR2 : un échec R2 est absorbé (jamais bloquant)', () =>
  avecBaseStockage(async () => {
    assert.equal(await supprimerVideoR2('https://cdn.test/boosts/b/v.mp4', async () => ({ success: false, error: 'R2 indisponible' })), false);
    assert.equal(
      await supprimerVideoR2('https://cdn.test/boosts/b/v.mp4', async () => {
        throw new Error('réseau');
      }),
      false
    );
  }));

test('nettoyerVideos : supprime le fichier puis la référence, garde la référence si R2 échoue', () =>
  avecBaseStockage(async () => {
    const liste = BoostModel.listerVideosAPurger;
    const maj = BoostModel.mettreAJour;
    const misesAJour: Array<{ id: number; donnees: unknown }> = [];
    BoostModel.listerVideosAPurger = async (joursBrouillon, joursTermine) => {
      assert.equal(joursBrouillon, 7);
      assert.equal(joursTermine, 30);
      return [
        { id: 1, video_url: 'https://cdn.test/boosts/a/v1.mp4' },
        { id: 2, video_url: 'https://cdn.test/boosts/b/v2.mp4' },
        { id: 3, video_url: 'https://cdn.test/boosts/c/v3.mp4' }
      ];
    };
    BoostModel.mettreAJour = (async (id: number, donnees: unknown) => {
      misesAJour.push({ id, donnees });
      return null;
    }) as typeof BoostModel.mettreAJour;
    try {
      const resultat = await BoostService.nettoyerVideos(async (chemin) => (chemin.includes('/v2') ? { success: false, error: 'boom' } : { success: true }));
      assert.deepEqual(resultat, { examinees: 3, supprimees: 2, erreurs: 1 });
      assert.deepEqual(
        misesAJour.map((m) => m.id),
        [1, 3]
      );
      assert.deepEqual(misesAJour[0].donnees, { video_url: null, video_duree_sec: null });
    } finally {
      BoostModel.listerVideosAPurger = liste;
      BoostModel.mettreAJour = maj;
    }
  }));
