import { metaGraphGet } from '../lib/meta/graph';
import { CiblageBoost } from '../lib/database-types';
import { construireTargeting, depenseVersFcfa, deviseCompte } from './meta-ads.service';
import { chargerMetaConfig, estModeSimule, evaluerConnexion, MetaConfig, optionsGraph } from './meta-connexion.service';
import { logger } from '../utils/logger';

/**
 * Estimations affichées dans le wizard vendeur (port de boost_meta/src/lib/meta/estimate.ts).
 * - Audience : `act_/reachestimate` (MAU bas/haut).
 * - Impressions/jour : CPM réel du compte sur 90 jours, sinon fourchette CPM réglable (46–85 FCFA).
 * - Mode simulé ou connexion Meta incomplète : repli silencieux (audience indisponible, fourchette CPM).
 *   La courbe `delivery_estimate.daily_outcomes_curve` n'est plus servie par Meta depuis juillet 2026
 *   (cf. README_CAMPAIGN_WIZARD de boost_meta) : elle n'est donc pas portée.
 */

export interface EstimationAudience {
  min: number | null;
  max: number | null;
  disponible: boolean;
}

export interface EstimationImpressions {
  budget_jour_fcfa: number;
  min: number | null;
  max: number | null;
  source: 'compte' | 'defaut';
}

function positif(valeur: unknown): number | null {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function impressionsDepuisCpm(budgetJourFcfa: number, cpmMin: number, cpmMax: number): { min: number | null; max: number | null } {
  const bas = Math.min(cpmMin, cpmMax);
  const haut = Math.max(cpmMin, cpmMax);
  if (budgetJourFcfa <= 0 || bas <= 0 || haut <= 0) return { min: null, max: null };
  return {
    min: Math.max(1, Math.round((budgetJourFcfa / haut) * 1000)),
    max: Math.max(1, Math.round((budgetJourFcfa / bas) * 1000))
  };
}

/** Config utilisable pour une estimation, ou null (mode simulé, connexion non prête). */
async function configEstimation(): Promise<MetaConfig | null> {
  if (estModeSimule()) return null;
  const config = await chargerMetaConfig();
  return evaluerConnexion(config).prete ? config : null;
}

export async function estimerAudience(ciblage: CiblageBoost): Promise<EstimationAudience> {
  const config = await configEstimation();
  if (!config) return { min: null, max: null, disponible: false };
  try {
    // Même ciblage que la publication (villes et intérêts compris), sans l'option Advantage+.
    const spec = construireTargeting(ciblage);
    delete spec.targeting_automation;
    const json = await metaGraphGet<{ data?: unknown }>(
      `act_${config.adAccountId}/reachestimate`,
      { targeting_spec: spec },
      config.accessToken,
      optionsGraph(config)
    );
    const brut = Array.isArray(json.data) ? json.data[0] : (json.data ?? json);
    const ligne = (brut ?? {}) as Record<string, unknown>;
    return {
      min: positif(ligne.users_lower_bound ?? ligne.estimate_mau_lower_bound ?? ligne.users),
      max: positif(ligne.users_upper_bound ?? ligne.estimate_mau_upper_bound ?? ligne.users),
      disponible: true
    };
  } catch (err: any) {
    logger.warn(`[MetaEstimation] reachestimate indisponible : ${err?.message}`);
    return { min: null, max: null, disponible: false };
  }
}

let cacheCpm: { valeur: number | null; expire: number } | null = null;

async function cpmCompteFcfa(fxXafParUsd: number): Promise<number | null> {
  const config = await configEstimation();
  if (!config) return null;
  if (cacheCpm && cacheCpm.expire > Date.now()) return cacheCpm.valeur;
  let valeur: number | null = null;
  try {
    const devise = await deviseCompte(config);
    const json = await metaGraphGet<{ data?: Array<{ spend?: string; impressions?: string }> }>(
      `act_${config.adAccountId}/insights`,
      { fields: 'spend,impressions', date_preset: 'last_90d' },
      config.accessToken,
      optionsGraph(config)
    );
    const impressions = Number(json.data?.[0]?.impressions ?? 0);
    const depense = Number(json.data?.[0]?.spend ?? 0);
    if (impressions >= 1000 && depense > 0) {
      valeur = (depenseVersFcfa(depense, devise, fxXafParUsd) / impressions) * 1000;
    }
  } catch (err: any) {
    logger.warn(`[MetaEstimation] CPM du compte indisponible : ${err?.message}`);
  }
  cacheCpm = { valeur, expire: Date.now() + 6 * 60 * 60 * 1000 };
  return valeur;
}

export async function estimerImpressionsJour(
  budgetsJourFcfa: number[],
  options: { cpmMinFcfa: number; cpmMaxFcfa: number; fxXafParUsd: number }
): Promise<EstimationImpressions[]> {
  const cpmCompte = await cpmCompteFcfa(options.fxXafParUsd);
  const cpmMin = cpmCompte ? cpmCompte * 0.77 : options.cpmMinFcfa;
  const cpmMax = cpmCompte ? cpmCompte / 0.7 : options.cpmMaxFcfa;
  return budgetsJourFcfa.map((budget) => ({
    budget_jour_fcfa: budget,
    ...impressionsDepuisCpm(budget, cpmMin, cpmMax),
    source: cpmCompte ? 'compte' : 'defaut'
  }));
}
