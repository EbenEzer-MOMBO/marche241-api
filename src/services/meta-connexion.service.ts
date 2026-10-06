import { MetaConnexion } from '../lib/database-types';
import { metaGraphGet, OptionsGraph } from '../lib/meta/graph';
import { MetaConnexionModel } from '../models/meta-connexion.model';
import { logger } from '../utils/logger';

/**
 * Connexion Meta Ads centralisée du boost.
 * - Environnement de l'API : uniquement les secrets META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN
 *   (system user permanent) et le garde-fou META_DRY_RUN (propre à chaque environnement : une branche
 *   Neon copiée de la prod ne doit jamais pouvoir publier de vraies pubs).
 * - Base (table meta_connexion) : compte publicitaire, Page et Instagram découverts auprès de Meta et
 *   choisis dans le back-office, plus le résultat de la dernière vérification (jeton, devise, statut).
 */

/** Permission indispensable pour créer des campagnes. */
export const PERMISSION_ADS = 'ads_management';

export interface MetaConfig {
  dryRun: boolean;
  appId: string;
  appSecret: string;
  accessToken: string;
  adAccountId: string;
  pageId: string;
  instagramId: string;
  devise: string | null;
  connexion: MetaConnexion | null;
}

export class MetaConnexionErreur extends Error {
  constructor(
    message: string,
    public readonly statusHttp = 400,
    public readonly code = 'META_CONNEXION_ERREUR',
    public readonly errors?: Array<{ field: string; code: string; message: string }>
  ) {
    super(message);
    this.name = 'MetaConnexionErreur';
  }
}

// ---------------------------------------------------------------------------
// Configuration (environnement + base), avec cache court
// ---------------------------------------------------------------------------

const DUREE_CACHE_MS = 60_000;
let cache: { config: MetaConfig; expire: number } | null = null;
let surcharge: MetaConfig | null = null;

function dryRunEnv(): boolean {
  return (process.env.META_DRY_RUN ?? 'true') !== 'false';
}

/** Mode simulé : décidé par l'environnement seul (aucun accès base), surchargé dans les tests. */
export function estModeSimule(): boolean {
  return surcharge ? surcharge.dryRun : dryRunEnv();
}

export function configDepuis(connexion: MetaConnexion | null): MetaConfig {
  return {
    dryRun: dryRunEnv(),
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    adAccountId: (connexion?.ad_account_id || '').replace(/^act_/, ''),
    pageId: connexion?.page_id || '',
    instagramId: connexion?.instagram_id || '',
    devise: connexion?.devise || null,
    connexion
  };
}

export async function chargerMetaConfig(): Promise<MetaConfig> {
  if (surcharge) return surcharge;
  if (cache && cache.expire > Date.now()) return cache.config;
  let connexion: MetaConnexion | null = null;
  try {
    connexion = await MetaConnexionModel.lire();
  } catch (err: any) {
    logger.warn(`[MetaConnexion] Lecture de meta_connexion impossible : ${err?.message}`);
  }
  const config = configDepuis(connexion);
  cache = { config, expire: Date.now() + DUREE_CACHE_MS };
  return config;
}

export function viderCacheConfigMeta(): void {
  cache = null;
}

/** Tests unitaires : fournit une config complète sans base ni variables d'environnement (null pour revenir au réel). */
export function definirMetaConfigPourTests(config: Partial<MetaConfig> | null): void {
  surcharge = config
    ? {
        dryRun: false,
        appId: 'app-test',
        appSecret: '',
        accessToken: 'jeton-test',
        adAccountId: '999',
        pageId: 'page_1',
        instagramId: '',
        devise: 'XAF',
        connexion: null,
        ...config
      }
    : null;
  cache = null;
}

/** Options Graph de la connexion : appsecret_proof dès que le secret de l'app est connu. */
export function optionsGraph(config: MetaConfig): OptionsGraph {
  return config.appSecret ? { appSecret: config.appSecret } : {};
}

// ---------------------------------------------------------------------------
// Évaluation (fonction pure, testée)
// ---------------------------------------------------------------------------

export interface EvaluationConnexion {
  prete: boolean;
  raisons: string[];
}

export function evaluerConnexion(config: MetaConfig): EvaluationConnexion {
  const raisons: string[] = [];
  const manquantes = [
    ['META_APP_ID', config.appId],
    ['META_APP_SECRET', config.appSecret],
    ['META_ACCESS_TOKEN', config.accessToken]
  ].filter(([, v]) => !v).map(([k]) => k);
  if (manquantes.length) raisons.push(`Variables d'environnement manquantes : ${manquantes.join(', ')}`);
  if (!config.adAccountId) raisons.push('Aucun compte publicitaire choisi');
  if (!config.pageId) raisons.push('Aucune Page Facebook choisie');
  const c = config.connexion;
  if (config.adAccountId && config.pageId) {
    if (!c?.verifie_le) raisons.push('Connexion jamais vérifiée auprès de Meta');
    else {
      if (c.jeton_valide !== true) raisons.push('Jeton Meta invalide ou expiré');
      else if (!c.jeton_permissions.includes(PERMISSION_ADS)) raisons.push(`Permission « ${PERMISSION_ADS} » absente du jeton`);
      if (c.statut_compte !== null && c.statut_compte !== 1) raisons.push(`Compte publicitaire non actif (statut Meta ${c.statut_compte})`);
      if (!c.devise) raisons.push('Devise du compte publicitaire inconnue');
    }
  }
  return { prete: raisons.length === 0, raisons };
}

// ---------------------------------------------------------------------------
// Découverte (comptes pub et Pages accessibles au jeton)
// ---------------------------------------------------------------------------

export interface CompteDecouvert {
  id: string;
  nom: string;
  devise: string | null;
  fuseau: string | null;
  statut: number | null;
  actif: boolean;
}

export interface PageDecouverte {
  id: string;
  nom: string;
  instagram: { id: string; nom: string | null } | null;
}

export interface DecouverteMeta {
  comptes: CompteDecouvert[];
  pages: PageDecouverte[];
  suggestion: { ad_account_id: string | null; page_id: string | null };
}

interface LigneCompte {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

interface LignePage {
  id?: string;
  name?: string;
  instagram_business_account?: { id?: string; username?: string };
}

export function normaliserDecouverte(comptes: LigneCompte[] | undefined, pages: LignePage[] | undefined): DecouverteMeta {
  const listeComptes: CompteDecouvert[] = (comptes ?? [])
    .map((c) => {
      const id = String(c.account_id ?? c.id ?? '').replace(/^act_/, '');
      const statut = c.account_status ?? null;
      return {
        id,
        nom: c.name ?? `Compte ${id}`,
        devise: c.currency ? c.currency.toUpperCase() : null,
        fuseau: c.timezone_name ?? null,
        statut,
        actif: statut === 1
      };
    })
    .filter((c) => c.id);
  const listePages: PageDecouverte[] = (pages ?? [])
    .filter((p) => p.id)
    .map((p) => ({
      id: String(p.id),
      nom: p.name ?? `Page ${p.id}`,
      instagram: p.instagram_business_account?.id
        ? { id: String(p.instagram_business_account.id), nom: p.instagram_business_account.username ?? null }
        : null
    }));
  const comptesActifs = listeComptes.filter((c) => c.actif);
  return {
    comptes: listeComptes,
    pages: listePages,
    suggestion: {
      ad_account_id: comptesActifs.length === 1 ? comptesActifs[0].id : null,
      page_id: listePages.length === 1 ? listePages[0].id : null
    }
  };
}

function exigerSecrets(config: MetaConfig): void {
  if (!config.appId || !config.appSecret || !config.accessToken) {
    throw new MetaConnexionErreur(
      "Renseignez META_APP_ID, META_APP_SECRET et META_ACCESS_TOKEN dans l'environnement de l'API",
      409,
      'META_SECRETS_MANQUANTS'
    );
  }
}

export async function decouvrir(): Promise<DecouverteMeta> {
  const config = configDepuis(null);
  exigerSecrets(config);
  const opts = optionsGraph(config);
  const [comptes, pages] = await Promise.all([
    metaGraphGet<{ data?: LigneCompte[] }>(
      'me/adaccounts',
      { fields: 'account_id,name,currency,timezone_name,account_status', limit: 100 },
      config.accessToken,
      opts
    ),
    metaGraphGet<{ data?: LignePage[] }>(
      'me/accounts',
      { fields: 'id,name,instagram_business_account{id,username}', limit: 100 },
      config.accessToken,
      opts
    )
  ]);
  return normaliserDecouverte(comptes.data, pages.data);
}

// ---------------------------------------------------------------------------
// Vérification et choix
// ---------------------------------------------------------------------------

interface DebugToken {
  data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; error?: { message?: string } };
}

export async function verifier(): Promise<MetaConnexion | null> {
  viderCacheConfigMeta();
  const actuelle = await MetaConnexionModel.lire();
  const config = configDepuis(actuelle);
  const erreurs: string[] = [];

  if (!config.appId || !config.appSecret || !config.accessToken) {
    const connexion = await MetaConnexionModel.enregistrerVerification({
      jeton_valide: null,
      jeton_permissions: [],
      jeton_expire_le: null,
      message_erreur: "Variables META_APP_ID, META_APP_SECRET ou META_ACCESS_TOKEN manquantes dans l'environnement de l'API"
    });
    viderCacheConfigMeta();
    return connexion;
  }

  let jetonValide: boolean | null = null;
  let permissions: string[] = [];
  let expireLe: Date | null = null;
  try {
    const dbg = await metaGraphGet<DebugToken>('debug_token', { input_token: config.accessToken }, `${config.appId}|${config.appSecret}`);
    jetonValide = dbg.data?.is_valid === true;
    permissions = dbg.data?.scopes ?? [];
    expireLe = dbg.data?.expires_at ? new Date(dbg.data.expires_at * 1000) : null;
    if (!jetonValide) erreurs.push(`Jeton invalide : ${dbg.data?.error?.message ?? 'refusé par Meta'}`);
  } catch (err: any) {
    erreurs.push(`Vérification du jeton impossible : ${err?.message}`);
  }

  const opts = optionsGraph(config);
  const maj: Parameters<typeof MetaConnexionModel.enregistrerVerification>[0] = {
    jeton_valide: jetonValide,
    jeton_permissions: permissions,
    jeton_expire_le: expireLe,
    message_erreur: null
  };
  if (jetonValide && config.adAccountId) {
    try {
      const compte = await metaGraphGet<LigneCompte>(
        `act_${config.adAccountId}`,
        { fields: 'name,currency,timezone_name,account_status' },
        config.accessToken,
        opts
      );
      maj.ad_account_nom = compte.name ?? null;
      maj.devise = compte.currency ? compte.currency.toUpperCase() : null;
      maj.fuseau = compte.timezone_name ?? null;
      maj.statut_compte = compte.account_status ?? null;
    } catch (err: any) {
      erreurs.push(`Compte publicitaire illisible : ${err?.message}`);
    }
  }
  if (jetonValide && config.pageId) {
    try {
      const page = await metaGraphGet<LignePage>(
        config.pageId,
        { fields: 'name,instagram_business_account{id,username}' },
        config.accessToken,
        opts
      );
      maj.page_nom = page.name ?? null;
      maj.instagram_id = page.instagram_business_account?.id ? String(page.instagram_business_account.id) : null;
      maj.instagram_nom = page.instagram_business_account?.username ?? null;
    } catch (err: any) {
      erreurs.push(`Page Facebook illisible : ${err?.message}`);
    }
  }
  maj.message_erreur = erreurs.length ? erreurs.join(' ; ') : null;
  const connexion = await MetaConnexionModel.enregistrerVerification(maj);
  viderCacheConfigMeta();
  if (erreurs.length) logger.warn(`[MetaConnexion] Vérification : ${maj.message_erreur}`);
  return connexion;
}

/** Enregistre le compte pub et la Page choisis (doivent figurer dans la découverte), puis vérifie. */
export async function enregistrerChoix(choix: { ad_account_id: string; page_id: string; modifie_par?: string | null }): Promise<MetaConnexion | null> {
  const decouverte = await decouvrir();
  const adAccountId = choix.ad_account_id.replace(/^act_/, '');
  const compte = decouverte.comptes.find((c) => c.id === adAccountId);
  const page = decouverte.pages.find((p) => p.id === choix.page_id);
  const errors: Array<{ field: string; code: string; message: string }> = [];
  if (!compte) errors.push({ field: 'ad_account_id', code: 'META_INCONNU', message: "Ce compte publicitaire n'est pas accessible avec le jeton Meta" });
  if (!page) errors.push({ field: 'page_id', code: 'META_INCONNU', message: "Cette Page n'est pas accessible avec le jeton Meta" });
  if (errors.length || !compte || !page) {
    throw new MetaConnexionErreur(errors[0].message, 400, 'VALIDATION_ERROR', errors);
  }
  await MetaConnexionModel.enregistrerChoix({
    ad_account_id: compte.id,
    ad_account_nom: compte.nom,
    page_id: page.id,
    page_nom: page.nom,
    instagram_id: page.instagram?.id ?? null,
    instagram_nom: page.instagram?.nom ?? null,
    modifie_par: choix.modifie_par ?? null
  });
  return verifier();
}

/** Rafraîchissement périodique (cron de synchro) : seulement hors mode simulé et si un compte est choisi. */
export async function verifierSiNecessaire(): Promise<void> {
  if (estModeSimule()) return;
  const config = await chargerMetaConfig();
  if (!config.adAccountId) return;
  try {
    await verifier();
  } catch (err: any) {
    logger.warn(`[MetaConnexion] Vérification périodique impossible : ${err?.message}`);
  }
}
