import { Request, Response } from 'express';
import { BoostModel, BoostParametresModel } from '../models/boost.model';
import { BoutiqueModel } from '../models/boutique.model';
import { BoostErreur, BoostService } from '../services/boost.service';
import { estimerAudience, estimerImpressionsJour } from '../services/meta-estimation.service';
import { santeMeta, estModeSimule } from '../services/meta-ads.service';
import { decouvrir, enregistrerChoix, MetaConnexionErreur, verifier } from '../services/meta-connexion.service';
import { MetaGraphError } from '../lib/meta/graph';
import { budgetParJour, devisDepuisTotal, estTotalDansBornes, formaterFcfa } from '../lib/boost/devis';
import { fraisEncaissement } from '../lib/boost/reliquat';
import { LIBELLES_STATUT_BOOST } from '../lib/boost/transitions';
import { Boost } from '../lib/database-types';
import {
  DUREES_BOOST,
  GROUPES_INTERETS,
  INTERETS_CIBLAGE,
  LANGUES_CIBLAGE,
  PAYS_CIBLAGE,
  VILLES_GABON
} from '../config/ciblage-boost.config';
import { CONFORMITE_BOOST } from '../config/conformite-boost.config';
import { logger } from '../utils/logger';

const corps = (req: Request) => (req as any).validatedBody ?? req.body;
const params = (req: Request) => (req as any).validatedParams ?? req.params;
const requete = (req: Request) => (req as any).validatedQuery ?? req.query;

function repondreErreur(res: Response, err: unknown, contexte: string): void {
  if (err instanceof MetaConnexionErreur) {
    res.status(err.statusHttp).json({ success: false, message: err.message, code: err.code, ...(err.errors ? { errors: err.errors } : {}) });
    return;
  }
  if (err instanceof MetaGraphError) {
    res.status(502).json({ success: false, message: `Meta : ${err.message}`, code: 'META_ERREUR' });
    return;
  }
  if (err instanceof BoostErreur) {
    res.status(err.statusHttp).json({
      success: false,
      message: err.message,
      code: err.code,
      ...((err as BoostErreur & { errors?: unknown }).errors ? { errors: (err as BoostErreur & { errors?: unknown }).errors } : {})
    });
    return;
  }
  logger.error(`[BoostController] ${contexte}:`, (err as Error)?.message ?? err);
  res.status(500).json({ success: false, message: `Erreur lors de ${contexte}` });
}

/** Charge le boost et vérifie que le vendeur connecté possède sa boutique (l'admin passe toujours). */
async function chargerBoostAutorise(req: Request, res: Response): Promise<Boost | null> {
  const boost = await BoostModel.getById(Number(params(req).id));
  if (!boost) {
    res.status(404).json({ success: false, message: 'Boost introuvable', code: 'BOOST_INTROUVABLE' });
    return null;
  }
  if (req.isAdmin && !req.vendeur) return boost;
  if (!req.vendeur || !(await BoutiqueModel.isOwnedByVendeur(boost.boutique_id, req.vendeur.id))) {
    res.status(403).json({ success: false, message: "Ce boost n'appartient pas à l'une de vos boutiques" });
    return null;
  }
  return boost;
}

export class BoostController {
  // ---------------------------------------------------------------- vendeur

  static async getParametres(_req: Request, res: Response): Promise<void> {
    try {
      const parametres = await BoostParametresModel.lire();
      res.json({
        success: true,
        parametres: {
          total_min_fcfa: parametres.total_min_fcfa,
          total_max_fcfa: parametres.total_max_fcfa,
          duree_min_jours: parametres.duree_min_jours,
          duree_max_jours: parametres.duree_max_jours,
          commission_bps: parametres.commission_bps,
          commission_min_fcfa: parametres.commission_min_fcfa,
          tva_bps: parametres.tva_bps,
          frais_encaissement_bps: parametres.frais_encaissement_bps,
          budget_jour_min_fcfa: parametres.budget_jour_min_fcfa,
          packs: parametres.packs,
          kill_switch: parametres.kill_switch,
          types: { plateforme: false, meta: true },
          durees: DUREES_BOOST,
          pays: PAYS_CIBLAGE,
          villes: VILLES_GABON.map(({ cle, nom }) => ({ cle, nom })),
          langues: LANGUES_CIBLAGE,
          interets: INTERETS_CIBLAGE.map(({ code, nom, groupe }) => ({ code, nom, groupe })),
          groupes_interets: GROUPES_INTERETS,
          statuts: LIBELLES_STATUT_BOOST,
          mode_simule: estModeSimule()
        }
      });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des paramètres du boost');
    }
  }

  static async getPrefill(req: Request, res: Response): Promise<void> {
    try {
      const { boutique_id, produit_id } = requete(req);
      if (!req.isAdmin && !(await BoutiqueModel.isOwnedByVendeur(Number(boutique_id), req.vendeur!.id))) {
        res.status(403).json({ success: false, message: "Cette boutique ne vous appartient pas" });
        return;
      }
      res.json({ success: true, prefill: await BoostService.prefill(Number(boutique_id), produit_id ? Number(produit_id) : null) });
    } catch (err) {
      repondreErreur(res, err, 'le pré-remplissage du boost');
    }
  }

  static async getDevis(req: Request, res: Response): Promise<void> {
    try {
      const { total_fcfa, duree_jours } = corps(req);
      const p = await BoostParametresModel.lire();
      if (!estTotalDansBornes(total_fcfa, p.total_min_fcfa, p.total_max_fcfa)) {
        const message = `Le montant doit être compris entre ${formaterFcfa(p.total_min_fcfa)} et ${formaterFcfa(p.total_max_fcfa)}`;
        res.status(400).json({
          success: false,
          message,
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'total_fcfa', code: 'BOOST_CHAMP_INVALIDE', message }]
        });
        return;
      }
      const devis = devisDepuisTotal(total_fcfa, p.commission_bps, p.commission_min_fcfa, p.tva_bps);
      res.json({
        success: true,
        devis: {
          ...devis,
          duree_jours,
          budget_jour_fcfa: budgetParJour(devis.budget_media_fcfa, duree_jours),
          frais_encaissement_fcfa: fraisEncaissement(devis.total_fcfa, p.frais_encaissement_bps)
        }
      });
    } catch (err: any) {
      if (!(err instanceof BoostErreur) && err?.message?.includes('commission minimum')) {
        res.status(400).json({
          success: false,
          message: err.message,
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'total_fcfa', code: 'BOOST_CHAMP_INVALIDE', message: err.message }]
        });
        return;
      }
      repondreErreur(res, err, 'le calcul du devis');
    }
  }

  static async estimerAudience(req: Request, res: Response): Promise<void> {
    try {
      const { ciblage } = corps(req);
      res.json({
        success: true,
        audience: await estimerAudience({ pays: ['GA'], villes: [], age_min: 18, age_max: 65, sexes: [], langues: [], interets: [], ...ciblage })
      });
    } catch (err) {
      repondreErreur(res, err, "l'estimation d'audience");
    }
  }

  static async estimerImpressions(req: Request, res: Response): Promise<void> {
    try {
      const { totaux_fcfa, duree_jours } = corps(req);
      const p = await BoostParametresModel.lire();
      const medias = (totaux_fcfa as number[]).map((total) => {
        try {
          return devisDepuisTotal(total, p.commission_bps, p.commission_min_fcfa, p.tva_bps).budget_media_fcfa;
        } catch {
          return 0;
        }
      });
      const estimations = await estimerImpressionsJour(
        medias.map((m) => budgetParJour(m, duree_jours)),
        { cpmMinFcfa: p.cpm_min_fcfa, cpmMaxFcfa: p.cpm_max_fcfa, fxXafParUsd: p.fx_xaf_par_usd }
      );
      res.json({
        success: true,
        impressions: estimations.map((e, i) => ({ total_fcfa: totaux_fcfa[i], budget_media_fcfa: medias[i], ...e }))
      });
    } catch (err) {
      repondreErreur(res, err, "l'estimation des impressions");
    }
  }

  static async listerParBoutique(req: Request, res: Response): Promise<void> {
    try {
      const { boutiqueId } = params(req);
      res.json({ success: true, boosts: await BoostModel.listerParBoutique(Number(boutiqueId)) });
    } catch (err) {
      repondreErreur(res, err, 'la récupération des boosts');
    }
  }

  static async creer(req: Request, res: Response): Promise<void> {
    try {
      const { boutique_id, ...donnees } = corps(req);
      const boost = await BoostService.creerBrouillon(Number(boutique_id), req.vendeur!.id, donnees);
      res.status(201).json({ success: true, boost });
    } catch (err) {
      repondreErreur(res, err, 'la création du boost');
    }
  }

  static async detail(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, ...(await BoostService.detail(boost, true)) });
    } catch (err) {
      repondreErreur(res, err, 'la récupération du boost');
    }
  }

  static async modifier(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, boost: await BoostService.modifierBrouillon(boost, corps(req)) });
    } catch (err) {
      repondreErreur(res, err, 'la modification du boost');
    }
  }

  static async supprimer(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      await BoostService.supprimerBrouillon(boost);
      res.json({ success: true, message: 'Brouillon supprimé' });
    } catch (err) {
      repondreErreur(res, err, 'la suppression du boost');
    }
  }

  static async soumettre(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, boost: await BoostService.soumettre(boost) });
    } catch (err) {
      repondreErreur(res, err, 'la soumission du boost');
    }
  }

  static async annulerSoumission(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, boost: await BoostService.annulerSoumission(boost) });
    } catch (err) {
      repondreErreur(res, err, "l'annulation de la soumission");
    }
  }

  static async payer(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      const resultat = await BoostService.initierPaiement(boost, {
        ...corps(req),
        email: corps(req).email || req.vendeur?.email || null,
        nom: corps(req).nom || req.vendeur?.nom || null
      });
      res.json({
        success: true,
        bill_id: resultat.bill_id,
        transaction_id: resultat.transaction_id,
        ...(resultat.url ? { redirect: true, url: resultat.url } : {}),
        message: resultat.url ? 'Redirection vers la plateforme de paiement carte...' : 'Validez le paiement sur votre téléphone'
      });
    } catch (err) {
      repondreErreur(res, err, "l'initialisation du paiement du boost");
    }
  }

  static async pause(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, boost: await BoostService.mettreEnPause(boost, req.vendeur ? 'vendeur' : 'admin') });
    } catch (err) {
      repondreErreur(res, err, 'la mise en pause du boost');
    }
  }

  static async reprendre(req: Request, res: Response): Promise<void> {
    try {
      const boost = await chargerBoostAutorise(req, res);
      if (!boost) return;
      res.json({ success: true, boost: await BoostService.reprendre(boost, req.vendeur ? 'vendeur' : 'admin') });
    } catch (err) {
      repondreErreur(res, err, 'la reprise du boost');
    }
  }

  // ---------------------------------------------------------------- admin (clé de service)

  static async listerAdmin(req: Request, res: Response): Promise<void> {
    try {
      const filtres = requete(req);
      const { boosts, total } = await BoostModel.listerAdmin(filtres);
      res.json({ success: true, boosts, total, page: Number(filtres.page ?? 1), limite: Number(filtres.limite ?? 20) });
    } catch (err) {
      repondreErreur(res, err, 'la récupération des boosts');
    }
  }

  static async statsAdmin(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, stats: await BoostModel.compterParStatut() });
    } catch (err) {
      repondreErreur(res, err, 'le calcul des statistiques des boosts');
    }
  }

  static async detailAdmin(req: Request, res: Response): Promise<void> {
    try {
      const boost = await BoostModel.getById(Number(params(req).id));
      if (!boost) {
        res.status(404).json({ success: false, message: 'Boost introuvable', code: 'BOOST_INTROUVABLE' });
        return;
      }
      res.json({ success: true, ...(await BoostService.detail(boost, false)), conformite_items: CONFORMITE_BOOST });
    } catch (err) {
      repondreErreur(res, err, 'la récupération du boost');
    }
  }

  static async approuver(req: Request, res: Response): Promise<void> {
    try {
      const { conformite, valide_par } = corps(req);
      const { boost, erreur } = await BoostService.approuver(Number(params(req).id), conformite, valide_par);
      if (erreur) {
        res.status(502).json({ success: false, message: `Publication Meta impossible : ${erreur}`, code: 'META_ERREUR', boost });
        return;
      }
      res.json({ success: true, boost, message: boost.dry_run ? 'Boost publié (mode simulé)' : 'Boost publié sur Meta' });
    } catch (err) {
      repondreErreur(res, err, "l'approbation du boost");
    }
  }

  static async refuser(req: Request, res: Response): Promise<void> {
    try {
      const { note, valide_par } = corps(req);
      res.json({ success: true, boost: await BoostService.refuser(Number(params(req).id), note, valide_par) });
    } catch (err) {
      repondreErreur(res, err, 'le refus du boost');
    }
  }

  static async pauseAdmin(req: Request, res: Response): Promise<void> {
    await BoostController.pause(req, res);
  }

  static async reprendreAdmin(req: Request, res: Response): Promise<void> {
    await BoostController.reprendre(req, res);
  }

  static async cloturer(req: Request, res: Response): Promise<void> {
    try {
      const boost = await BoostModel.getById(Number(params(req).id));
      if (!boost) {
        res.status(404).json({ success: false, message: 'Boost introuvable', code: 'BOOST_INTROUVABLE' });
        return;
      }
      if (boost.statut === 'actif' || boost.statut === 'en_pause') {
        try {
          await BoostService.synchroniser(boost);
        } catch (err: any) {
          logger.warn(`[BoostController] Synchro avant clôture du boost #${boost.id} : ${err?.message}`);
        }
      }
      const frais = await BoostModel.getById(boost.id);
      if (frais && (frais.statut === 'actif' || frais.statut === 'en_pause')) {
        res.json({ success: true, boost: await BoostService.cloturer(frais, 'admin') });
        return;
      }
      res.json({ success: true, boost: frais });
    } catch (err) {
      repondreErreur(res, err, 'la clôture du boost');
    }
  }

  static async marquerRembourse(req: Request, res: Response): Promise<void> {
    try {
      const { note, valide_par } = corps(req);
      res.json({ success: true, boost: await BoostService.marquerRembourse(Number(params(req).id), note || null, valide_par) });
    } catch (err) {
      repondreErreur(res, err, 'le marquage du remboursement');
    }
  }

  static async getParametresAdmin(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, parametres: await BoostParametresModel.lire(), conformite_items: CONFORMITE_BOOST });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des paramètres');
    }
  }

  static async majParametres(req: Request, res: Response): Promise<void> {
    try {
      const actuels = await BoostParametresModel.lire();
      const fusion = { ...actuels, ...corps(req) };
      const erreurs: Array<{ field: string; message: string }> = [];
      if (fusion.total_min_fcfa > fusion.total_max_fcfa) erreurs.push({ field: 'total_min_fcfa', message: 'Le minimum doit être inférieur au maximum' });
      if (fusion.duree_min_jours > fusion.duree_max_jours) erreurs.push({ field: 'duree_min_jours', message: 'La durée minimum doit être inférieure à la durée maximum' });
      if (fusion.cpm_min_fcfa > fusion.cpm_max_fcfa) erreurs.push({ field: 'cpm_min_fcfa', message: 'Le CPM minimum doit être inférieur au CPM maximum' });
      for (const pack of fusion.packs as Array<{ code: string; total_fcfa: number }>) {
        if (pack.total_fcfa < fusion.total_min_fcfa || pack.total_fcfa > fusion.total_max_fcfa) {
          erreurs.push({ field: 'packs', message: `Le pack ${pack.code} doit respecter les bornes de montant` });
        }
      }
      if (erreurs.length) {
        res.status(400).json({ success: false, message: erreurs[0].message, code: 'VALIDATION_ERROR', errors: erreurs.map((e) => ({ ...e, code: 'BOOST_PARAMETRE_INVALIDE' })) });
        return;
      }
      res.json({ success: true, parametres: await BoostParametresModel.ecrire(corps(req)) });
    } catch (err) {
      repondreErreur(res, err, 'la mise à jour des paramètres');
    }
  }

  static async santeMeta(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, sante: await santeMeta() });
    } catch (err) {
      repondreErreur(res, err, "la vérification de l'état Meta");
    }
  }

  static async decouverteMeta(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, decouverte: await decouvrir() });
    } catch (err) {
      repondreErreur(res, err, 'la découverte des comptes Meta');
    }
  }

  static async connexionMeta(req: Request, res: Response): Promise<void> {
    try {
      const { ad_account_id, page_id, modifie_par } = corps(req);
      await enregistrerChoix({ ad_account_id, page_id, modifie_par });
      res.json({ success: true, sante: await santeMeta() });
    } catch (err) {
      repondreErreur(res, err, "l'enregistrement de la connexion Meta");
    }
  }

  static async verifierMeta(_req: Request, res: Response): Promise<void> {
    try {
      await verifier();
      res.json({ success: true, sante: await santeMeta() });
    } catch (err) {
      repondreErreur(res, err, 'la vérification de la connexion Meta');
    }
  }

  // ---------------------------------------------------------------- cron

  static async synchroniser(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, resultat: await BoostService.synchroniserTous() });
    } catch (err) {
      repondreErreur(res, err, 'la synchronisation des boosts');
    }
  }
}
