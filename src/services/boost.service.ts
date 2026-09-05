import { logger } from '../utils/logger';
import { BoostModel, BoostEvenementModel, BoostStatModel } from '../models/boost.model';
import { BoutiqueModel } from '../models/boutique.model';
import { MetaAdsService } from './meta-ads.service';
import { getForfaitByCode } from '../config/forfaits-boost.config';
import { Boost } from '../lib/database-types';

/**
 * Orchestrateur métier du boost publicitaire (Phase 1 : boost de boutique).
 * Appelé depuis boost.controller.ts (création/actions vendeur et admin), depuis
 * paiement.controller.ts (déclenchement après confirmation du paiement), et depuis
 * cron.service.ts (synchro revue Meta, synchro stats, expiration).
 */
export class BoostService {
  /**
   * Crée un boost en statut `en_attente_paiement`. Ne crée pas la transaction ni n'appelle
   * Ebilling : ces étapes restent sur le flux générique existant (POST /transactions puis
   * POST /paiements/mobile ou /visa), la confirmation de paiement déclenchant `publier()`.
   */
  static async creerBoost(
    boutiqueId: number,
    vendeurId: number,
    forfaitCode: string,
    zones: string[]
  ): Promise<Boost> {
    const forfait = getForfaitByCode(forfaitCode);
    if (!forfait) {
      throw new Error(`Forfait de boost inconnu: ${forfaitCode}`);
    }

    if (!zones || zones.length === 0) {
      throw new Error('Au moins une zone de ciblage doit être renseignée');
    }

    const boost = await BoostModel.creerBoost({
      boutique_id: boutiqueId,
      vendeur_id: vendeurId,
      type_boost: 'boutique',
      forfait_code: forfait.code,
      statut: 'en_attente_paiement',
      prix_vendeur_fcfa: forfait.prix_vendeur_fcfa,
      budget_meta_reel_fcfa: forfait.budget_meta_reel_fcfa,
      duree_jours: forfait.duree_jours,
      zones
    });

    await BoostEvenementModel.creer(boost.id, 'creation', { forfait_code: forfait.code, zones });

    return boost;
  }

  /**
   * Déclenché après confirmation du paiement (paiement à l'acte) : publie la campagne sur Meta.
   * N'échoue jamais bruyamment : le paiement a déjà eu lieu, un échec Meta place le boost en
   * statut `erreur` pour traitement manuel plutôt que de lever une exception.
   */
  static async publier(boostId: number): Promise<void> {
    const boost = await BoostModel.getBoostById(boostId);
    if (!boost) {
      logger.error(`[BoostService] publier(): boost introuvable #${boostId}`);
      return;
    }

    if (boost.statut !== 'en_attente_paiement') {
      logger.warn(`[BoostService] publier(): boost #${boostId} déjà dans l'état ${boost.statut}, ignoré`);
      return;
    }

    await BoostEvenementModel.creer(boostId, 'paiement_confirme');

    const boutique = await BoutiqueModel.getBoutiqueById(boost.boutique_id);
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const boutiqueUrl = `${frontendUrl}/${boutique?.slug ?? ''}?utm_source=facebook&utm_medium=boost&utm_campaign=boost_${boostId}`;

    try {
      const resultat = await MetaAdsService.creerCampagne(boost, boutiqueUrl, boutique?.logo ?? boutique?.banniere);

      if (!resultat) {
        await BoostModel.updateStatut(boostId, 'erreur', { raison_rejet: 'Échec de la création de la campagne Meta' });
        await BoostEvenementModel.creer(boostId, 'erreur', { etape: 'creerCampagne' });
        return;
      }

      const dateDebut = new Date();
      const dateFin = new Date(dateDebut.getTime() + boost.duree_jours * 24 * 60 * 60 * 1000);

      await BoostModel.updateStatut(boostId, 'en_attente_revue', {
        meta_campaign_id: resultat.campaign_id,
        meta_adset_id: resultat.adset_id,
        meta_ad_id: resultat.ad_id,
        meta_creative_id: resultat.creative_id,
        date_debut: dateDebut,
        date_fin: dateFin
      });

      await BoostEvenementModel.creer(boostId, 'publie', resultat as unknown as Record<string, unknown>);
    } catch (error: any) {
      logger.error(`[BoostService] Exception lors de la publication du boost #${boostId}:`, error.message);
      await BoostModel.updateStatut(boostId, 'erreur', { raison_rejet: error.message });
      await BoostEvenementModel.creer(boostId, 'erreur', { message: error.message });
    }
  }

  /**
   * Cron : synchronise le statut de revue Meta des boosts en attente
   */
  static async syncStatutsRevue(): Promise<{ examines: number; actifs: number; rejetes: number }> {
    const boosts = await BoostModel.getBoostsEnAttenteRevue();
    let actifs = 0;
    let rejetes = 0;

    for (const boost of boosts) {
      if (!boost.meta_ad_id) continue;

      const resultat = await MetaAdsService.getStatutRevue(boost.meta_ad_id);
      if (!resultat) continue;

      if (resultat.statut_normalise === 'actif') {
        await BoostModel.updateStatut(boost.id, 'actif', { meta_statut_revue: resultat.meta_statut_revue });
        await BoostEvenementModel.creer(boost.id, 'revue_maj', { statut: 'actif' });
        actifs++;
      } else if (resultat.statut_normalise === 'rejete') {
        await BoostModel.updateStatut(boost.id, 'rejete', {
          meta_statut_revue: resultat.meta_statut_revue,
          raison_rejet: resultat.raison_rejet
        });
        await BoostEvenementModel.creer(boost.id, 'revue_maj', { statut: 'rejete', raison: resultat.raison_rejet });
        rejetes++;
      }
    }

    return { examines: boosts.length, actifs, rejetes };
  }

  /**
   * Cron : synchronise les statistiques (impressions/clics/dépense) des boosts actifs
   */
  static async syncStats(): Promise<{ examines: number; maj: number }> {
    const boosts = await BoostModel.getBoostsActifs();
    let maj = 0;

    for (const boost of boosts) {
      if (!boost.meta_ad_id) continue;

      const stats = await MetaAdsService.getStats(boost.meta_ad_id);
      if (!stats) continue;

      await BoostStatModel.ajouterSnapshot(boost.id, stats);
      await BoostEvenementModel.creer(boost.id, 'stats_maj', stats as unknown as Record<string, unknown>);
      maj++;
    }

    return { examines: boosts.length, maj };
  }

  /**
   * Cron : termine les boosts actifs dont la date de fin est dépassée
   */
  static async expirerBoostsTermines(): Promise<{ termines: number }> {
    const boosts = await BoostModel.getBoostsActifsExpires();

    for (const boost of boosts) {
      if (boost.meta_ad_id) {
        await MetaAdsService.mettreEnPause(boost.meta_ad_id);
      }
      await BoostModel.updateStatut(boost.id, 'termine');
      await BoostEvenementModel.creer(boost.id, 'termine');
    }

    return { termines: boosts.length };
  }

  static async pauseAdmin(boostId: number): Promise<Boost> {
    const boost = await BoostModel.getBoostById(boostId);
    if (!boost) {
      throw new Error('Boost introuvable');
    }
    if (boost.meta_ad_id) {
      await MetaAdsService.mettreEnPause(boost.meta_ad_id);
    }
    await BoostEvenementModel.creer(boostId, 'pause');
    return BoostModel.updateStatut(boostId, 'en_pause');
  }

  static async reprendreAdmin(boostId: number): Promise<Boost> {
    const boost = await BoostModel.getBoostById(boostId);
    if (!boost) {
      throw new Error('Boost introuvable');
    }
    if (boost.meta_ad_id) {
      await MetaAdsService.reprendre(boost.meta_ad_id);
    }
    await BoostEvenementModel.creer(boostId, 'reprise');
    return BoostModel.updateStatut(boostId, 'actif');
  }
}
