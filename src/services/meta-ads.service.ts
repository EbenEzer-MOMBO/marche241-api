import { logger } from '../utils/logger';
import { Boost } from '../lib/database-types';

/**
 * Service d'intégration Meta Marketing API pour le boost publicitaire (Phase 1 : boost de boutique).
 *
 * Patron repris de whatsapp.service.ts : classe statique, config via variables d'environnement,
 * `isMetaConfigured()` comme garde, `fetch()` natif vers Graph API, échec loggé et non bloquant
 * (retourne `null` plutôt que de lever une exception) — un appel Meta en échec ne doit jamais
 * faire planter le flux de paiement qui l'a déclenché.
 *
 * Mode stub : tant que META_ACCESS_TOKEN / META_AD_ACCOUNT_ID ne sont pas configurés, toutes les
 * méthodes retournent des résultats déterministes simulés, ce qui permet de tester tout le cycle
 * de vie d'un boost (paiement → publication → revue → stats → expiration) sans identifiants Meta réels.
 */

export interface MetaCampagneResult {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  creative_id: string;
}

export interface MetaStatutRevueResult {
  statut_normalise: 'actif' | 'rejete' | 'en_attente_revue';
  meta_statut_revue: string;
  raison_rejet?: string;
}

export interface MetaStatsResult {
  impressions: number;
  clics: number;
  depense_fcfa: number;
}

/** Traduit les zones libres stockées sur le boost vers un ciblage Meta minimal. */
const construireTargeting = (zones: string[]): Record<string, unknown> => {
  if (!zones || zones.length === 0 || zones.includes('monde_entier')) {
    return { geo_locations: { countries: ['GA'] } }; // fallback Gabon en attendant un mapping pays réel
  }
  return { geo_locations: { countries: zones } };
};

export class MetaAdsService {
  private static appId = process.env.META_APP_ID;
  private static appSecret = process.env.META_APP_SECRET;
  private static adAccountId = process.env.META_AD_ACCOUNT_ID;
  private static accessToken = process.env.META_ACCESS_TOKEN;
  private static pageId = process.env.META_PAGE_ID;
  private static apiVersion = process.env.META_API_VERSION || 'v21.0';

  /**
   * Vérifie si l'intégration Meta Marketing API est configurée
   */
  static isMetaConfigured(): boolean {
    return !!(this.accessToken && this.adAccountId && this.pageId);
  }

  private static baseUrl(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}/${path}`;
  }

  private static async appelGraph<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: Record<string, unknown>): Promise<T | null> {
    try {
      const url = new URL(this.baseUrl(path));
      if (method === 'GET') {
        url.searchParams.set('access_token', this.accessToken as string);
      }

      const response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({ ...body, access_token: this.accessToken })
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        logger.error(`[MetaAdsService] Erreur Graph API HTTP ${response.status} sur ${path}:`, data?.error?.message || JSON.stringify(data));
        return null;
      }

      return data as T;
    } catch (error: any) {
      logger.error(`[MetaAdsService] Exception lors de l'appel Graph API sur ${path}:`, error.message);
      return null;
    }
  }

  /**
   * Crée la Campagne → l'Ensemble de publicités → la Création → la Publicité, dans cet ordre,
   * chacune taguée avec l'id du boost. En mode stub, retourne des identifiants déterministes.
   */
  static async creerCampagne(boost: Boost, boutiqueUrl: string, imageUrl?: string): Promise<MetaCampagneResult | null> {
    if (!this.isMetaConfigured()) {
      logger.warn(`[MetaAdsService] Mode stub (Meta non configuré) : simulation de la création de campagne pour le boost #${boost.id}`);
      return {
        campaign_id: `stub-campaign-${boost.id}`,
        adset_id: `stub-adset-${boost.id}`,
        ad_id: `stub-ad-${boost.id}`,
        creative_id: `stub-creative-${boost.id}`
      };
    }

    const nomCampagne = `boost_${boost.boutique_id}_${new Date().toISOString().slice(0, 7)}`;

    const campagne = await this.appelGraph<{ id: string }>(`act_${this.adAccountId}/campaigns`, 'POST', {
      name: nomCampagne,
      objective: 'OUTCOME_TRAFFIC',
      status: 'ACTIVE',
      special_ad_categories: []
    });
    if (!campagne?.id) return null;

    // XAF (FCFA) n'a pas de sous-unité (0 décimale ISO 4217) : `daily_budget` s'exprime donc
    // directement en FCFA, sans conversion en centimes.
    const adset = await this.appelGraph<{ id: string }>(`act_${this.adAccountId}/adsets`, 'POST', {
      name: `${nomCampagne}_adset`,
      campaign_id: campagne.id,
      daily_budget: Math.max(1, Math.round(boost.budget_meta_reel_fcfa / Math.max(1, boost.duree_jours))),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      targeting: construireTargeting(boost.zones),
      status: 'ACTIVE'
    });
    if (!adset?.id) return null;

    const creative = await this.appelGraph<{ id: string }>(`act_${this.adAccountId}/adcreatives`, 'POST', {
      name: `${nomCampagne}_creative`,
      object_story_spec: {
        page_id: this.pageId,
        link_data: {
          link: boutiqueUrl,
          message: 'Découvrez notre boutique sur Marché241 !',
          picture: imageUrl
        }
      }
    });
    if (!creative?.id) return null;

    const ad = await this.appelGraph<{ id: string }>(`act_${this.adAccountId}/ads`, 'POST', {
      name: `${nomCampagne}_ad`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: 'ACTIVE'
    });
    if (!ad?.id) return null;

    return { campaign_id: campagne.id, adset_id: adset.id, ad_id: ad.id, creative_id: creative.id };
  }

  /**
   * Récupère le statut de revue Meta d'une publicité et le normalise vers un statut boost.
   */
  static async getStatutRevue(adId: string): Promise<MetaStatutRevueResult | null> {
    if (!this.isMetaConfigured() || adId.startsWith('stub-')) {
      return { statut_normalise: 'actif', meta_statut_revue: 'ACTIVE (stub)' };
    }

    const resultat = await this.appelGraph<{ effective_status: string; configured_status: string }>(
      `${adId}?fields=effective_status,configured_status`,
      'GET'
    );
    if (!resultat) return null;

    const statut = resultat.effective_status;
    if (statut === 'ACTIVE') {
      return { statut_normalise: 'actif', meta_statut_revue: statut };
    }
    if (statut === 'DISAPPROVED') {
      return { statut_normalise: 'rejete', meta_statut_revue: statut, raison_rejet: 'Publicité rejetée par la revue Meta' };
    }

    return { statut_normalise: 'en_attente_revue', meta_statut_revue: statut };
  }

  /**
   * Récupère les statistiques (impressions/clics/dépense) d'une publicité.
   */
  static async getStats(adId: string): Promise<MetaStatsResult | null> {
    if (!this.isMetaConfigured() || adId.startsWith('stub-')) {
      return { impressions: 0, clics: 0, depense_fcfa: 0 };
    }

    const resultat = await this.appelGraph<{ data: Array<{ impressions?: string; clicks?: string; spend?: string }> }>(
      `${adId}/insights?fields=impressions,clicks,spend`,
      'GET'
    );
    if (!resultat) return null;

    const ligne = resultat.data?.[0];
    return {
      impressions: Number(ligne?.impressions) || 0,
      clics: Number(ligne?.clicks) || 0,
      depense_fcfa: Math.round(Number(ligne?.spend) || 0)
    };
  }

  static async mettreEnPause(adId: string): Promise<boolean> {
    if (!this.isMetaConfigured() || adId.startsWith('stub-')) return true;
    const resultat = await this.appelGraph<{ success: boolean }>(adId, 'POST', { status: 'PAUSED' });
    return !!resultat;
  }

  static async reprendre(adId: string): Promise<boolean> {
    if (!this.isMetaConfigured() || adId.startsWith('stub-')) return true;
    const resultat = await this.appelGraph<{ success: boolean }>(adId, 'POST', { status: 'ACTIVE' });
    return !!resultat;
  }

  static async supprimer(adId: string): Promise<boolean> {
    if (!this.isMetaConfigured() || adId.startsWith('stub-')) return true;
    const resultat = await this.appelGraph<{ success: boolean }>(adId, 'DELETE');
    return !!resultat;
  }
}
