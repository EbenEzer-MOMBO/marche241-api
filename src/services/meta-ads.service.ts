import { randomBytes } from 'crypto';
import { MetaGraphError, metaGraphGet, metaGraphPost, META_GRAPH_VERSION } from '../lib/meta/graph';
import { fenetrePublication } from '../lib/boost/planning';
import { clesMetaVilles, idsMetaInterets } from '../config/ciblage-boost.config';
import { CiblageBoost, ObjectifBoost } from '../lib/database-types';
import { logger } from '../utils/logger';
import {
  chargerMetaConfig,
  estModeSimule,
  evaluerConnexion,
  MetaConfig,
  MetaConnexionErreur,
  optionsGraph
} from './meta-connexion.service';

/**
 * Intégration Marketing API Meta du boost publicitaire.
 * Port de boost_meta/src/lib/meta/ads.ts, avec :
 * - connexion centralisée (meta-connexion.service) : secrets dans l'environnement, compte pub / Page /
 *   Instagram choisis dans le back-office et stockés en base, appsecret_proof sur chaque appel ;
 * - mode simulé (`META_DRY_RUN` différent de "false") → identifiants `dry_*`. Hors mode simulé, une
 *   connexion incomplète bloque la publication (409 META_NON_CONFIGURE) au lieu de simuler en silence ;
 * - insights jour par jour (`time_increment=1`) sur toute la période (boost_meta ne lisait que « today ») ;
 * - lecture du statut effectif de la publicité (revue Meta : DISAPPROVED…) ;
 * - villes et intérêts traduits en identifiants Meta figés et vérifiés (config/ciblage-boost.config).
 */

export { estModeSimule } from './meta-connexion.service';
export type { MetaConfig } from './meta-connexion.service';

/** Connexion prête pour publier ? Lève 409 META_NON_CONFIGURE avec les raisons sinon. */
export async function exigerConnexionPrete(): Promise<MetaConfig> {
  const config = await chargerMetaConfig();
  const { prete, raisons } = evaluerConnexion(config);
  if (!prete) {
    throw new MetaConnexionErreur(`Connexion Meta non configurée : ${raisons.join(' ; ')}`, 409, 'META_NON_CONFIGURE');
  }
  return config;
}

// ---------------------------------------------------------------------------
// Conversions de devise (fonctions pures, testées)
// ---------------------------------------------------------------------------

const XAF_PAR_EUR = 655.957;
const DEVISES_SANS_DECIMALE = new Set(['XAF', 'XOF', 'CFA']);

/** Montant FCFA → unité mineure de la devise du compte pub (XAF entier, centimes EUR/USD). */
export function fcfaVersMontantMineur(fcfa: number, devise: string, fxXafParUsd: number): number {
  const cur = devise.toUpperCase();
  if (DEVISES_SANS_DECIMALE.has(cur)) return Math.max(1, Math.round(fcfa));
  if (cur === 'EUR') return Math.max(100, Math.round((fcfa / XAF_PAR_EUR) * 100));
  const fx = fxXafParUsd > 0 ? fxXafParUsd : 600;
  return Math.max(100, Math.round((fcfa / fx) * 100));
}

/** Dépense Meta (montant décimal dans la devise du compte) → FCFA entiers. */
export function depenseVersFcfa(montant: number, devise: string, fxXafParUsd: number): number {
  const cur = devise.toUpperCase();
  if (DEVISES_SANS_DECIMALE.has(cur)) return Math.round(montant);
  if (cur === 'EUR') return Math.round(montant * XAF_PAR_EUR);
  return Math.round(montant * (fxXafParUsd > 0 ? fxXafParUsd : 600));
}

// ---------------------------------------------------------------------------
// Construction des objets Meta (fonctions pures, testées)
// ---------------------------------------------------------------------------

export function objectifMeta(objectif: ObjectifBoost) {
  switch (objectif) {
    case 'whatsapp':
      return { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', cta: 'WHATSAPP_MESSAGE' };
    case 'notoriete':
      return { objective: 'OUTCOME_AWARENESS', optimization_goal: 'REACH', cta: 'LEARN_MORE' };
    default:
      return { objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LINK_CLICKS', cta: 'SHOP_NOW' };
  }
}

/** Ciblage Meta d'un boost : utilisé à l'identique pour la publication et l'estimation d'audience. */
export function construireTargeting(
  ciblage: Pick<CiblageBoost, 'pays' | 'villes' | 'age_min' | 'age_max' | 'sexes' | 'langues' | 'interets'>
): Record<string, unknown> {
  const clesVilles = clesMetaVilles(ciblage.villes ?? []);
  const idsInterets = idsMetaInterets(ciblage.interets ?? []);
  const pays = ciblage.pays?.length ? ciblage.pays : ['GA'];
  const targeting: Record<string, unknown> = {
    geo_locations: clesVilles.length
      ? { cities: clesVilles.map((key) => ({ key, radius: 25, distance_unit: 'kilometer' })) }
      : { countries: pays },
    age_min: ciblage.age_min ?? 18,
    age_max: ciblage.age_max ?? 65,
    targeting_automation: { advantage_audience: 0 }
  };
  if (ciblage.sexes?.length === 1) targeting.genders = [ciblage.sexes[0] === 'homme' ? 1 : 2];
  if (ciblage.langues?.length) {
    targeting.locales = ciblage.langues.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (idsInterets.length) targeting.flexible_spec = [{ interests: idsInterets.map((id) => ({ id })) }];
  return targeting;
}

export function lienDestination(objectif: ObjectifBoost, urlDestination: string | null, whatsappE164: string | null): string {
  if (objectif === 'whatsapp') return `https://wa.me/${(whatsappE164 ?? '').replace(/\D/g, '')}`;
  return urlDestination ?? '';
}

// ---------------------------------------------------------------------------
// Appels Graph
// ---------------------------------------------------------------------------

/** Devise du compte pub : lue en base (vérification de la connexion), sinon demandée à Meta. */
export async function deviseCompte(config?: MetaConfig): Promise<string> {
  if (estModeSimule()) return 'XAF';
  const c = config ?? (await chargerMetaConfig());
  if (c.devise) return c.devise;
  if (!c.adAccountId || !c.accessToken) return 'XAF';
  const json = await metaGraphGet<{ currency?: string }>(`act_${c.adAccountId}`, { fields: 'currency' }, c.accessToken, optionsGraph(c));
  return String(json.currency ?? 'USD').toUpperCase();
}

export interface PublicationInput {
  nom: string;
  objectif: ObjectifBoost;
  budgetMediaFcfa: number;
  dureeJours: number;
  ciblage: CiblageBoost;
  urlDestination: string | null;
  whatsappE164: string | null;
  texte: string;
  titre: string;
  description?: string | null;
  imageUrl: string;
  fxXafParUsd: number;
}

export interface PublicationResult {
  dryRun: boolean;
  campaignId: string;
  adSetId: string;
  adId: string;
  dateDebut: Date;
  dateFin: Date;
}

/**
 * Crée campagne, ensemble et publicité en PAUSED, sans les activer.
 * L'activation (`activerPublication`) n'a lieu qu'après le verrou de statut en base :
 * un échec de transition laisse la campagne en pause, donc sans dépense.
 */
export async function publierBoost(input: PublicationInput): Promise<PublicationResult> {
  const fenetre = fenetrePublication(input.dureeJours);
  const dateDebut = new Date(fenetre.start_time);
  const dateFin = new Date(fenetre.end_time);

  if (estModeSimule()) {
    const suffixe = randomBytes(4).toString('hex');
    return {
      dryRun: true,
      campaignId: `dry_campaign_${suffixe}`,
      adSetId: `dry_adset_${suffixe}`,
      adId: `dry_ad_${suffixe}`,
      dateDebut,
      dateFin
    };
  }

  const config = await exigerConnexionPrete();
  const { accessToken: token, adAccountId: actId, pageId } = config;
  const opts = optionsGraph(config);
  const devise = await deviseCompte(config);
  const meta = objectifMeta(input.objectif);

  const campaignId = await metaGraphPost(
    `act_${actId}/campaigns`,
    {
      name: input.nom,
      objective: meta.objective,
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false
    },
    token,
    opts
  );
  if (!campaignId) throw new MetaGraphError('Campagne Meta sans identifiant', 'campaigns');

  const adSetBody: Record<string, unknown> = {
    name: `${input.nom} — ensemble`,
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: meta.optimization_goal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    lifetime_budget: fcfaVersMontantMineur(input.budgetMediaFcfa, devise, input.fxXafParUsd),
    ...fenetre,
    targeting: construireTargeting(input.ciblage),
    status: 'PAUSED'
  };
  if (input.objectif === 'whatsapp') {
    adSetBody.destination_type = 'WHATSAPP';
    adSetBody.promoted_object = { page_id: pageId };
  } else if (input.objectif === 'notoriete') {
    adSetBody.promoted_object = { page_id: pageId };
  } else {
    adSetBody.destination_type = 'WEBSITE';
  }

  const adSetId = await metaGraphPost(`act_${actId}/adsets`, adSetBody, token, opts);
  if (!adSetId) throw new MetaGraphError('Ensemble de publicités Meta sans identifiant', 'adsets');

  const lien = lienDestination(input.objectif, input.urlDestination, input.whatsappE164);
  const objectStorySpec: Record<string, unknown> = {
    page_id: pageId,
    link_data: {
      message: input.texte,
      name: input.titre,
      description: input.description || undefined,
      link: lien,
      picture: input.imageUrl,
      call_to_action: { type: meta.cta, value: { link: lien } }
    }
  };
  if (config.instagramId) objectStorySpec.instagram_user_id = config.instagramId;

  const adId = await metaGraphPost(
    `act_${actId}/ads`,
    {
      name: `${input.nom} — pub`,
      adset_id: adSetId,
      status: 'PAUSED',
      creative: { object_story_spec: objectStorySpec }
    },
    token,
    opts
  );
  if (!adId) throw new MetaGraphError('Publicité Meta sans identifiant', 'ads');

  return { dryRun: false, campaignId, adSetId, adId, dateDebut, dateFin };
}

/** Passe campagne, ensemble et publicité en ACTIVE. Sans effet en mode simulé. */
export async function activerPublication(ids: { campaignId: string; adSetId: string; adId: string }): Promise<void> {
  if (estModeSimule() || ids.campaignId.startsWith('dry_')) return;
  const config = await chargerMetaConfig();
  const opts = optionsGraph(config);
  const token = config.accessToken;
  await metaGraphPost(ids.campaignId, { status: 'ACTIVE' }, token, opts);
  await metaGraphPost(ids.adSetId, { status: 'ACTIVE' }, token, opts);
  await metaGraphPost(ids.adId, { status: 'ACTIVE' }, token, opts);
}

export async function changerStatutCampagne(metaCampaignId: string, statut: 'ACTIVE' | 'PAUSED'): Promise<{ dryRun: boolean }> {
  if (estModeSimule() || metaCampaignId.startsWith('dry_')) return { dryRun: true };
  const config = await chargerMetaConfig();
  await metaGraphPost(metaCampaignId, { status: statut }, config.accessToken, optionsGraph(config));
  return { dryRun: false };
}

export interface InsightJour {
  date: string;
  depense: number; // devise du compte
  impressions: number;
  portee: number;
  clics: number;
  messages: number;
  brut: unknown;
}

interface LigneInsight {
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export function parserInsights(data: LigneInsight[] | undefined): InsightJour[] {
  return (data ?? [])
    .filter((row) => row.date_start)
    .map((row) => {
      const messages = row.actions?.find((a) => a.action_type.includes('messaging_conversation_started'))?.value
        ?? row.actions?.find((a) => a.action_type.includes('onsite_conversion'))?.value
        ?? '0';
      return {
        date: String(row.date_start),
        depense: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        portee: Number(row.reach ?? 0),
        clics: Number(row.inline_link_clicks ?? row.clicks ?? 0),
        messages: Number(messages),
        brut: row
      };
    });
}

/** Insights jour par jour entre deux dates (incluses). */
export async function lireInsights(metaCampaignId: string, depuis: string, jusqua: string): Promise<InsightJour[]> {
  if (estModeSimule() || metaCampaignId.startsWith('dry_')) return [];
  const config = await chargerMetaConfig();
  const json = await metaGraphGet<{ data?: LigneInsight[] }>(
    `${metaCampaignId}/insights`,
    {
      fields: 'spend,impressions,reach,clicks,inline_link_clicks,actions',
      time_range: { since: depuis, until: jusqua },
      time_increment: 1,
      limit: 100
    },
    config.accessToken,
    optionsGraph(config)
  );
  return parserInsights(json.data);
}

export type StatutRevueMeta = 'actif' | 'en_revue' | 'en_pause' | 'rejete' | 'termine' | 'autre';

export function normaliserStatutEffectif(effectiveStatus: string | undefined): StatutRevueMeta {
  switch ((effectiveStatus ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'actif';
    case 'PENDING_REVIEW':
    case 'IN_PROCESS':
    case 'PREAPPROVED':
      return 'en_revue';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'en_pause';
    case 'DISAPPROVED':
      return 'rejete';
    case 'ARCHIVED':
    case 'DELETED':
      return 'termine';
    default:
      return 'autre';
  }
}

export function motifRejet(feedback: unknown): string | null {
  if (!feedback || typeof feedback !== 'object') return null;
  const global = (feedback as { global?: Record<string, string> }).global;
  if (global && Object.keys(global).length) return Object.entries(global).map(([k, v]) => `${k} : ${v}`).join(' ; ');
  return JSON.stringify(feedback);
}

export async function lireStatutPublicite(metaAdId: string): Promise<{ effectiveStatus: string; statut: StatutRevueMeta; motif: string | null }> {
  if (estModeSimule() || metaAdId.startsWith('dry_')) {
    return { effectiveStatus: 'ACTIVE', statut: 'actif', motif: null };
  }
  const config = await chargerMetaConfig();
  const json = await metaGraphGet<{ effective_status?: string; ad_review_feedback?: unknown }>(
    metaAdId,
    { fields: 'effective_status,ad_review_feedback' },
    config.accessToken,
    optionsGraph(config)
  );
  const effectiveStatus = String(json.effective_status ?? '');
  return { effectiveStatus, statut: normaliserStatutEffectif(effectiveStatus), motif: motifRejet(json.ad_review_feedback) };
}

/** État de la connexion Meta pour le back-office (aucun secret renvoyé). Lecture seule : pas d'appel Meta. */
export async function santeMeta(): Promise<Record<string, unknown>> {
  const config = await chargerMetaConfig();
  const evaluation = evaluerConnexion(config);
  return {
    ok: evaluation.prete,
    raisons: evaluation.raisons,
    message: evaluation.prete ? null : evaluation.raisons.join(' ; '),
    dry_run: config.dryRun,
    graph_version: META_GRAPH_VERSION,
    secrets: {
      app_id: Boolean(config.appId),
      app_secret: Boolean(config.appSecret),
      access_token: Boolean(config.accessToken)
    },
    connexion: config.connexion
  };
}
