import { NextFunction, Request, Response } from 'express';
import {
  AvisInvitationModel,
  AvisModel,
  AvisParametresModel,
  AvisSoumis,
  FiltresAvis,
  parametresAvisEnCache,
  SOUMISSION_TROP_RAPIDE
} from '../models/avis.model';
import { AvisParametres } from '../lib/database-types';
import { hacherIp, hacherJetonAvis, jetonAvisBienForme } from '../lib/avis/jeton';
import { filtrerCommentaireAvis, nettoyerTexteAvis } from '../lib/avis/filtre';
import { statutInitialAvis } from '../lib/avis/parametres';
import { AvisService } from '../services/avis.service';
import { getClientIp } from '../utils/view-tracking';
import { logger } from '../utils/logger';

/** Durée minimale de remplissage du formulaire : en dessous, c'est un script. */
const DUREE_MIN_REMPLISSAGE_MS = 5000;
/** Le vendeur peut modifier sa réponse pendant 48 h. */
const DELAI_MODIFICATION_REPONSE_H = 48;
const parametres = parametresAvisEnCache;

const soumissionTropRapide = (res: Response): void => {
  res.status(400).json({
    success: false,
    message: 'Merci de prendre quelques secondes pour relire votre avis avant de l’envoyer.',
    code: 'SOUMISSION_TROP_RAPIDE'
  });
};

const invitationInvalide = (res: Response): void => {
  res.status(404).json({
    success: false,
    message: "Ce lien n'est plus valide. Il a peut-être expiré ou tous vos articles ont déjà été notés.",
    code: 'INVITATION_INVALIDE'
  });
};

const moduleDesactive = (res: Response): void => {
  res.status(403).json({
    success: false,
    message: 'Les avis sont momentanément indisponibles. Merci de réessayer plus tard.',
    code: 'AVIS_DESACTIVES'
  });
};

export class AvisController {
  // ==========================================================================
  // Public : invitation par jeton
  // ==========================================================================

  /** GET /avis/invitation/:jeton */
  static async invitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jeton } = (req as any).validatedParams as { jeton: string };
      if (!(await parametres()).actif) return moduleDesactive(res);
      if (!jetonAvisBienForme(jeton)) return invitationInvalide(res);
      const invitation = await AvisInvitationModel.trouverPublique(hacherJetonAvis(jeton));
      if (!invitation) return invitationInvalide(res);
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, invitation, longueur_max_commentaire: (await parametres()).longueur_max_commentaire });
    } catch (err) {
      next(err);
    }
  }

  /** POST /avis/invitation/:jeton */
  static async soumettre(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jeton } = (req as any).validatedParams as { jeton: string };
      const corps = (req as any).validatedBody as {
        avis: Array<{ produit_id: number; note: number; commentaire?: string | null }>;
        site_web?: string | null;
        rempli_en_ms?: number;
      };
      const p = await parametres();
      if (!p.actif) return moduleDesactive(res);
      if (!jetonAvisBienForme(jeton)) return invitationInvalide(res);

      // Pot de miel rempli : on répond comme si tout allait bien, sans rien écrire.
      if (corps.site_web && corps.site_web.trim() !== '') {
        logger.warn('[Avis] Soumission ignorée : pot de miel rempli');
        res.json({ success: true, resultat: { crees: 0, en_moderation: 0, ignores: [], terminee: true } });
        return;
      }
      // Premier filtre côté client ; la durée réelle (depuis l'ouverture du lien) est contrôlée en base
      if (corps.rempli_en_ms === undefined || corps.rempli_en_ms < DUREE_MIN_REMPLISSAGE_MS) return soumissionTropRapide(res);

      const erreurs: Array<{ field: string; message: string }> = [];
      const avis: AvisSoumis[] = corps.avis.map((a, i) => {
        const commentaire = nettoyerTexteAvis(a.commentaire);
        if (commentaire && commentaire.length > p.longueur_max_commentaire) {
          erreurs.push({
            field: `avis[${i}].commentaire`,
            message: `Le commentaire ne doit pas dépasser ${p.longueur_max_commentaire} caractères`
          });
        }
        const filtre = filtrerCommentaireAvis(commentaire, p.mots_interdits);
        return {
          produit_id: a.produit_id,
          note: a.note,
          commentaire,
          signale_auto: filtre.suspect,
          motifs_auto: filtre.motifs,
          statut: statutInitialAvis(a.note, filtre.suspect, p.auto_approbation)
        };
      });
      if (erreurs.length > 0) {
        res.status(400).json({ success: false, message: erreurs[0].message, code: 'VALIDATION_ERROR', errors: erreurs });
        return;
      }

      const ua = req.headers['user-agent'];
      const resultat = await AvisInvitationModel.soumettre(
        hacherJetonAvis(jeton),
        avis,
        {
          ip_hash: hacherIp(getClientIp(req)),
          user_agent: typeof ua === 'string' ? ua.slice(0, 255) : null
        },
        DUREE_MIN_REMPLISSAGE_MS
      );
      if (!resultat) return invitationInvalide(res);
      if (resultat === SOUMISSION_TROP_RAPIDE) return soumissionTropRapide(res);

      if (resultat.crees.length > 0) {
        void AvisService.alerterNouveauxAvis(resultat.crees, { numero_commande: resultat.numero_commande });
        const publies = resultat.crees.filter((c) => c.statut === 'approuve').map((c) => c.id);
        if (publies.length > 0) void AvisService.notifierVendeursAvisPublies(publies);
      }

      res.status(resultat.crees.length > 0 ? 201 : 200).json({
        success: true,
        resultat: {
          crees: resultat.crees.length,
          en_moderation: resultat.crees.filter((c) => c.statut === 'en_attente').length,
          ignores: resultat.ignores,
          terminee: resultat.terminee
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // Public : avis d'un produit
  // ==========================================================================

  /** GET /avis/produit/:produitId */
  static async listerPublics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { produitId } = (req as any).validatedParams as { produitId: number };
      const { page, limite } = (req as any).validatedQuery as { page: number; limite: number };
      const p = await parametres();
      const resume = await AvisModel.resumeProduit(produitId, p.seuil_affichage_note);
      if (!resume) {
        res.status(404).json({ success: false, message: 'Produit introuvable', code: 'PRODUIT_INTROUVABLE' });
        return;
      }
      const { avis, total } = await AvisModel.listerPublics(produitId, page, limite);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({
        success: true,
        avis,
        resume,
        pagination: { page, limite, total, pages: Math.ceil(total / limite) }
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // Vendeur (JWT)
  // ==========================================================================

  /** GET /avis/vendeur */
  static async listerVendeur(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filtres = (req as any).validatedQuery as FiltresAvis;
      const vendeurId = req.vendeur!.id;
      const [liste, sansReponse] = await Promise.all([AvisModel.lister(filtres, vendeurId), AvisModel.compterSansReponse(vendeurId)]);
      res.json({
        success: true,
        avis: liste.avis,
        sans_reponse: sansReponse,
        pagination: { page: liste.page, limite: liste.limite, total: liste.total, pages: Math.ceil(liste.total / liste.limite) }
      });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /avis/vendeur/:id/reponse */
  static async repondre(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      const reponse = nettoyerTexteAvis(((req as any).validatedBody as { reponse: string }).reponse);
      if (!reponse) {
        res.status(400).json({
          success: false,
          message: 'La réponse ne peut pas être vide',
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'reponse', message: 'La réponse ne peut pas être vide' }]
        });
        return;
      }
      const resultat = await AvisModel.repondre(id, req.vendeur!.id, reponse, DELAI_MODIFICATION_REPONSE_H);
      if (resultat === 'introuvable') {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      if (resultat === 'non_publie') {
        res.status(409).json({ success: false, message: 'Vous pourrez répondre une fois l’avis publié.', code: 'AVIS_NON_PUBLIE' });
        return;
      }
      if (resultat === 'delai_depasse') {
        res.status(409).json({
          success: false,
          message: `Votre réponse ne peut plus être modifiée (délai de ${DELAI_MODIFICATION_REPONSE_H} h dépassé).`,
          code: 'DELAI_REPONSE_DEPASSE'
        });
        return;
      }
      res.json({ success: true, avis: await AvisModel.trouver(id, req.vendeur!.id) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /avis/vendeur/:id/signaler */
  static async signaler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      const motif = nettoyerTexteAvis(((req as any).validatedBody as { motif: string }).motif) ?? '';
      const avis = await AvisModel.signaler(id, req.vendeur!.id, motif);
      if (!avis) {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      void AvisService.alerterSignalement(id, avis.boutique_nom, motif);
      res.json({ success: true, avis });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // Back-office (x-service-key)
  // ==========================================================================

  /** GET /avis/admin */
  static async listerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filtres = (req as any).validatedQuery as FiltresAvis;
      const liste = await AvisModel.lister(filtres, null);
      res.json({
        success: true,
        avis: liste.avis,
        pagination: { page: liste.page, limite: liste.limite, total: liste.total, pages: Math.ceil(liste.total / liste.limite) }
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /avis/admin/stats */
  static async stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, stats: await AvisModel.stats() });
    } catch (err) {
      next(err);
    }
  }

  /** GET /avis/admin/:id */
  static async detailAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      const avis = await AvisModel.trouver(id);
      if (!avis) {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      res.json({ success: true, avis });
    } catch (err) {
      next(err);
    }
  }

  /** POST /avis/admin/:id/approuver */
  static async approuver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      const { modere_par } = (req as any).validatedBody as { modere_par?: string | null };
      const resultat = await AvisModel.moderer(id, 'approuve', modere_par || null, null);
      if (!resultat) {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      if (resultat.avant !== 'approuve') void AvisService.notifierVendeursAvisPublies([id]);
      res.json({ success: true, avis: await AvisModel.trouver(id) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /avis/admin/approuver-en-masse */
  static async approuverEnMasse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids, modere_par } = (req as any).validatedBody as { ids: number[]; modere_par?: string | null };
      let approuves = 0;
      const nouvellementPublies: number[] = [];
      for (const id of ids) {
        const resultat = await AvisModel.moderer(id, 'approuve', modere_par || null, null);
        if (!resultat) continue;
        approuves += 1;
        if (resultat.avant !== 'approuve') nouvellementPublies.push(id);
      }
      if (nouvellementPublies.length > 0) void AvisService.notifierVendeursAvisPublies(nouvellementPublies);
      res.json({ success: true, approuves });
    } catch (err) {
      next(err);
    }
  }

  /** POST /avis/admin/:id/rejeter */
  static async rejeter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      const { motif, modere_par } = (req as any).validatedBody as { motif: string; modere_par?: string | null };
      const resultat = await AvisModel.moderer(id, 'rejete', modere_par || null, motif);
      if (!resultat) {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      res.json({ success: true, avis: await AvisModel.trouver(id) });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /avis/admin/:id */
  static async supprimer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = (req as any).validatedParams as { id: number };
      if (!(await AvisModel.supprimer(id))) {
        res.status(404).json({ success: false, message: 'Avis introuvable', code: 'AVIS_INTROUVABLE' });
        return;
      }
      res.json({ success: true, message: 'Avis supprimé' });
    } catch (err) {
      next(err);
    }
  }

  /** GET /avis/admin/parametres */
  static async lireParametres(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, parametres: await AvisParametresModel.lire() });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /avis/admin/parametres */
  static async ecrireParametres(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parametresMaj = await AvisParametresModel.ecrire((req as any).validatedBody as Partial<AvisParametres>);
      res.json({ success: true, parametres: parametresMaj });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // Cron
  // ==========================================================================

  /** GET /cron/avis/invitations */
  static async cronInvitations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, bilan: await AvisService.envoyerInvitations() });
    } catch (err) {
      next(err);
    }
  }
}
