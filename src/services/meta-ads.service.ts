import { randomBytes } from 'crypto';
import { MetaGraphError, metaGraphGet, metaGraphPost } from '../lib/meta/graph';
import { fenetrePublication } from '../lib/boost/planning';
import { interetParCode, nomVille } from '../config/ciblage-boost.config';
import { CiblageBoost, ObjectifBoost } from '../lib/database-types';
import { logger } from '../utils/logger';

/**
 * Intégration Marketing API Meta du boost publicitaire.
 * Port de boost_meta/src/lib/meta/ads.ts, avec :
 * - config lue dans l'environnement à chaque appel (system user token, un seul compte pub) ;
 * - mode simulé (`META_DRY_RUN` différent de "false" ou config incomplète) → identifiants `dry_*` ;
 * - insights jour par jour (`time_increment=1`) sur toute la période (boost_meta ne lisait que « today ») ;
 * - lecture du statut effectif de la publicité (revue Meta : DISAPPROVED…) ;
 * - intérêts résolus par recherche (`adinterest`) plutôt que par IDs en dur.
 */

export interface MetaConfig {
  graphVersion: string;
  dryRun: boolean;
  accessToken: string;
  adAccountId: string;
  pageId: string;
  instagramId: string;
}

export function getMetaConfig(): MetaConfig {
  return {
    graphVersion: process.env.META_GRAPH_VERSION || process.env.META_API_VERSION || 'v21.0',
    dryRun: (process.env.META_DRY_RUN ?? 'true') !== 'false',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    adAccountId: (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, ''),
    pageId: process.env.META_PAGE_ID || '',
    instagramId: process.env.META_INSTAGRAM_ID || ''
  };
}

export function estMetaConfigure(config = getMetaConfig()): boolean {
  return Boolean(config.accessToken && config.adAccountId && config.pageId);
}

export function estModeSimule(config = getMetaConfig()): boolean {
  return config.dryRun || !estMetaConfigure(config);
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

export function construireTargeting(
  ciblage: Pick<CiblageBoost, 'pays' | 'age_min' | 'age_max' | 'sexes' | 'langues'>,
  clesVilles: string[],
  idsInterets: string[]
): Record<string, unknown> {
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

const cacheDevise = new Map<string, string>();

export function viderCacheDevise(): void {
  cacheDevise.clear();
}

export async function deviseCompte(config = getMetaConfig()): Promise<string> {
  if (estModeSimule(config)) return 'XAF';
  const enCache = cacheDevise.get(config.adAccountId);
  if (enCache) return enCache;
  const json = await metaGraphGet<{ currency?: string }>(
    `act_${config.adAccountId}`,
    { fields: 'currency' },
    config.accessToken,
    config.graphVersion
  );
  const devise = String(json.currency ?? 'USD').toUpperCase();
  cacheDevise.set(config.adAccountId, devise);
  return devise;
}

async function resoudreVilles(cles: string[], config: MetaConfig): Promise<string[]> {
  const resolues: string[] = [];
  for (const cle of cles) {
    try {
      const json = await metaGraphGet<{ data?: Array<{ key?: string; country_code?: string }> }>(
        'search',
        { type: 'adgeolocation', location_types: ['city'], q: nomVille(cle), country_code: 'GA' },
        config.accessToken,
        config.graphVersion
      );
      const match = json.data?.find((row) => row.key && (row.country_code === 'GA' || !row.country_code));
      resolues.push(match?.key ? String(match.key) : cle);
    } catch {
      resolues.push(cle);
    }
  }
  return resolues;
}

async function resoudreInterets(codes: string[], config: MetaConfig): Promise<string[]> {
  const ids: string[] = [];
  for (const code of codes) {
    const interet = interetParCode(code);
    if (!interet) continue;
    try {
      const json = await metaGraphGet<{ data?: Array<{ id?: string; name?: string }> }>(
        'search',
        { type: 'adinterest', q: interet.requete, limit: 1, locale: 'fr_FR' },
        config.accessToken,
        config.graphVersion
      );
      const id = json.data?.[0]?.id;
      if (id) ids.push(String(id));
      else logger.warn(`[MetaAds] Intérêt introuvable chez Meta : ${code}`);
    } catch (err: any) {
      logger.warn(`[MetaAds] Résolution de l'intérêt ${code} impossible : ${err?.message}`);
    }
  }
  return ids;
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

/** Crée campagne → ad set → ad en PAUSED, puis active les trois (cf. FIX_ADMIN_APPROVE_META de boost_meta). */
export async function publierBoost(input: PublicationInput): Promise<PublicationResult> {
  const config = getMetaConfig();
  const fenetre = fenetrePublication(input.dureeJours);
  const dateDebut = new Date(fenetre.start_time);
  const dateFin = new Date(fenetre.end_time);

  if (estModeSimule(config)) {
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

  const { accessToken: token, graphVersion: version, adAccountId: actId, pageId } = config;
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
    version
  );
  if (!campaignId) throw new MetaGraphError('Campagne Meta sans identifiant', 'campaigns');

  const [villes, interets] = await Promise.all([
    resoudreVilles(input.ciblage.villes ?? [], config),
    resoudreInterets(input.ciblage.interets ?? [], config)
  ]);

  const adSetBody: Record<string, unknown> = {
    name: `${input.nom} — ensemble`,
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: meta.optimization_goal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    lifetime_budget: fcfaVersMontantMineur(input.budgetMediaFcfa, devise, input.fxXafParUsd),
    ...fenetre,
    targeting: construireTargeting(input.ciblage, villes, interets),
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

  const adSetId = await metaGraphPost(`act_${actId}/adsets`, adSetBody, token, version);
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
    version
  );
  if (!adId) throw new MetaGraphError('Publicité Meta sans identifiant', 'ads');

  await metaGraphPost(campaignId, { status: 'ACTIVE' }, token, version);
  await metaGraphPost(adSetId, { status: 'ACTIVE' }, token, version);
  await metaGraphPost(adId, { status: 'ACTIVE' }, token, version);

  return { dryRun: false, campaignId, adSetId, adId, dateDebut, dateFin };
}

export async function changerStatutCampagne(metaCampaignId: string, statut: 'ACTIVE' | 'PAUSED'): Promise<{ dryRun: boolean }> {
  const config = getMetaConfig();
  if (estModeSimule(config) || metaCampaignId.startsWith('dry_')) return { dryRun: true };
  await metaGraphPost(metaCampaignId, { status: statut }, config.accessToken, config.graphVersion);
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
  const config = getMetaConfig();
  if (estModeSimule(config) || metaCampaignId.startsWith('dry_')) return [];
  const json = await metaGraphGet<{ data?: LigneInsight[] }>(
    `${metaCampaignId}/insights`,
    {
      fields: 'spend,impressions,reach,clicks,inline_link_clicks,actions',
      time_range: { since: depuis, until: jusqua },
      time_increment: 1,
      limit: 100
    },
    config.accessToken,
    config.graphVersion
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
  const config = getMetaConfig();
  if (estModeSimule(config) || metaAdId.startsWith('dry_')) {
    return { effectiveStatus: 'ACTIVE', statut: 'actif', motif: null };
  }
  const json = await metaGraphGet<{ effective_status?: string; ad_review_feedback?: unknown }>(
    metaAdId,
    { fields: 'effective_status,ad_review_feedback' },
    config.accessToken,
    config.graphVersion
  );
  const effectiveStatus = String(json.effective_status ?? '');
  return { effectiveStatus, statut: normaliserStatutEffectif(effectiveStatus), motif: motifRejet(json.ad_review_feedback) };
}

/** État de la connexion Meta pour le back-office (aucun secret renvoyé). */
export async function santeMeta(): Promise<Record<string, unknown>> {
  const config = getMetaConfig();
  const base = {
    dry_run: config.dryRun,
    configure: estMetaConfigure(config),
    graph_version: config.graphVersion,
    compte_pub: config.adAccountId ? `act_${config.adAccountId}` : null,
    page_id: config.pageId || null,
    instagram_id: config.instagramId || null
  };
  if (!estMetaConfigure(config)) return { ...base, ok: false, message: 'Variables Meta incomplètes (mode simulé)' };
  try {
    const compte = await metaGraphGet<Record<string, unknown>>(
      `act_${config.adAccountId}`,
      { fields: 'name,currency,account_status,amount_spent,spend_cap,timezone_name' },
      config.accessToken,
      config.graphVersion
    );
    const page = await metaGraphGet<Record<string, unknown>>(config.pageId, { fields: 'name' }, config.accessToken, config.graphVersion);
    return { ...base, ok: true, compte, page };
  } catch (err: any) {
    return { ...base, ok: false, message: err?.message ?? 'Erreur Meta' };
  }
}
