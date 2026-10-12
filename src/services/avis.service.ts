import { AvisInvitationModel, AvisModel, AvisParametresModel, InvitationCreee } from '../models/avis.model';
import { prenomClient } from '../lib/avis/auteur';
import { genererJetonAvis } from '../lib/avis/jeton';
import { WhatsAppService } from './whatsapp.service';
import { PushService } from './push.service';
import { notifier } from './telegram.service';
import { logger } from '../utils/logger';

/** Taille des lots d'envoi du cron (limite le temps d'exécution et le débit WhatsApp). */
const TAILLE_LOT = 50;

/** Intervalle minimal entre deux résumés « avis en attente » envoyés à l'équipe. */
const INTERVALLE_RESUME_HEURES = 20;

/** Invitation jamais remise (WhatsApp en échec) : nombre d'essais au total et écart entre deux essais. */
const MAX_TENTATIVES_INVITATION = 3;
const INTERVALLE_RENVOI_HEURES = 6;

export interface BilanInvitationsAvis {
  actif: boolean;
  invitations: number;
  renvois: number;
  relances: number;
  echecs: number;
  resume_envoye: boolean;
}

type CanalEnvoi = 'meta' | 'green_api' | 'echec';

const frontend = (): string => (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');

/** Envoie le lien WhatsApp ; ne lève jamais (un échec est un canal 'echec'). */
async function envoyerLien(destinataire: Omit<InvitationCreee, 'jeton'>, jeton: string, relance: boolean): Promise<CanalEnvoi> {
  return WhatsAppService.sendInvitationAvis(destinataire.client_telephone, {
    prenom: prenomClient(destinataire.client_nom),
    numeroCommande: destinataire.numero_commande,
    boutiqueNom: destinataire.boutique_nom,
    jeton,
    relance
  }).catch((err) => {
    logger.error(`[AvisService] Envoi invitation commande ${destinataire.commande_id} impossible:`, err);
    return 'echec' as const;
  });
}

/** Premier envoi (ou renvoi d'une invitation jamais remise) : la tentative est toujours enregistrée. */
async function envoyerInvitation(invitation: InvitationCreee): Promise<boolean> {
  const canal = await envoyerLien(invitation, invitation.jeton, false);
  await AvisInvitationModel.marquerTentative(invitation.invitation_id, canal);
  return canal !== 'echec';
}

export class AvisService {
  /**
   * Cron : crée et envoie les invitations dues (commandes livrées depuis `delai_invitation_jours`),
   * renvoie celles jamais remises, puis les relances. Sans effet si le module est désactivé (kill switch),
   * à part le résumé quotidien des avis à modérer.
   */
  static async envoyerInvitations(): Promise<BilanInvitationsAvis> {
    const parametres = await AvisParametresModel.lire();
    const bilan: BilanInvitationsAvis = {
      actif: parametres.actif,
      invitations: 0,
      renvois: 0,
      relances: 0,
      echecs: 0,
      resume_envoye: false
    };
    // Le résumé est envoyé même module coupé : des avis peuvent rester à modérer
    bilan.resume_envoye = await AvisService.envoyerResumeQuotidien();
    if (!parametres.actif) return bilan;

    const commandes = await AvisInvitationModel.commandesAInviter(parametres.delai_invitation_jours, TAILLE_LOT);
    for (const commande of commandes) {
      const invitation = await AvisInvitationModel.creer(commande, parametres.validite_jeton_jours);
      if (!invitation) continue;
      if (await envoyerInvitation(invitation)) bilan.invitations += 1;
      else bilan.echecs += 1;
    }

    // Invitations jamais remises : nouvel essai (nouveau jeton, le précédent n'ayant jamais été reçu)
    const renvois = await AvisInvitationModel.renvoisDus(MAX_TENTATIVES_INVITATION, INTERVALLE_RENVOI_HEURES, TAILLE_LOT);
    for (const invitation of renvois) {
      if (await envoyerInvitation(invitation)) bilan.renvois += 1;
      else bilan.echecs += 1;
    }

    // Relance : le nouveau jeton n'est enregistré que si le message part, sinon le premier lien reste valable
    const ecart = parametres.relance_jours - parametres.delai_invitation_jours;
    if (parametres.relance_jours > 0 && ecart > 0) {
      const candidats = await AvisInvitationModel.candidatsRelance(ecart, TAILLE_LOT);
      for (const candidat of candidats) {
        const { jeton, hash } = genererJetonAvis();
        const canal = await envoyerLien(candidat, jeton, true);
        await AvisInvitationModel.appliquerRelance(candidat.invitation_id, canal, hash, parametres.validite_jeton_jours);
        if (canal !== 'echec') bilan.relances += 1;
        else bilan.echecs += 1;
      }
    }

    logger.info(
      `[AvisService] Invitations : ${bilan.invitations} envoyée(s), ${bilan.renvois} renvoi(s), ${bilan.relances} relance(s), ${bilan.echecs} échec(s)`
    );
    return bilan;
  }

  /**
   * Résumé quotidien sur Telegram : « N avis en attente de modération » (au plus une fois toutes les 20 h,
   * seulement s'il y a des avis en attente). Ne lève jamais.
   */
  static async envoyerResumeQuotidien(): Promise<boolean> {
    try {
      const stats = await AvisModel.stats();
      if (stats.en_attente === 0) return false;
      if (!(await AvisParametresModel.reserverResumeQuotidien(INTERVALLE_RESUME_HEURES))) return false;
      await notifier('avis_a_moderer', {
        titre: `${stats.en_attente} avis en attente de modération`,
        lignes: [stats.signales > 0 ? `dont ${stats.signales} signalé(s) à trancher en priorité` : null],
        lien: '/avis'
      });
      return true;
    } catch (err) {
      logger.warn('[AvisService] Résumé quotidien des avis non envoyé:', err);
      return false;
    }
  }

  /** Alerte l'équipe pour les avis à surveiller (≤ 2 étoiles ou suspects). Ne lève jamais. */
  static async alerterNouveauxAvis(
    avis: Array<{ id: number; note: number; signale_auto: boolean }>,
    contexte: { numero_commande?: string }
  ): Promise<void> {
    const aSurveiller = avis.filter((a) => a.note <= 2 || a.signale_auto);
    if (aSurveiller.length === 0) return;
    await notifier('avis_a_moderer', {
      titre: `${aSurveiller.length} avis à modérer en priorité`,
      lignes: [
        contexte.numero_commande ? `Commande ${contexte.numero_commande}` : null,
        ...aSurveiller.map((a) => `Avis #${a.id} : ${'★'.repeat(a.note)}${a.signale_auto ? ' (filtre automatique)' : ''}`)
      ],
      lien: '/avis'
    }).catch(() => false);
  }

  /** Alerte l'équipe d'un signalement vendeur. Ne lève jamais. */
  static async alerterSignalement(avisId: number, boutiqueNom: string, motif: string): Promise<void> {
    await notifier('avis_signale', {
      titre: `Avis #${avisId} signalé par ${boutiqueNom}`,
      lignes: [`Motif : ${motif}`],
      lien: `/avis?onglet=signales`
    }).catch(() => false);
  }

  /**
   * Avis publiés (unitaire ou en masse) : un seul push + un seul WhatsApp par vendeur, quel que soit le nombre
   * d'avis publiés pour lui (pas de rafale de messages lors d'une approbation en masse). Ne lève jamais :
   * la modération ne doit pas échouer à cause d'une notification.
   */
  static async notifierVendeursAvisPublies(avisIds: number[]): Promise<void> {
    try {
      const contextes = (await Promise.all(avisIds.map((id) => AvisModel.contexteNotification(id)))).filter(
        (ctx): ctx is NonNullable<typeof ctx> => ctx !== null
      );
      const parVendeur = new Map<number, typeof contextes>();
      for (const ctx of contextes) parVendeur.set(ctx.vendeur_id, [...(parVendeur.get(ctx.vendeur_id) ?? []), ctx]);

      for (const [vendeurId, liste] of parVendeur) {
        const premier = liste[0];
        const chemin = `/admin/${premier.boutique_slug}/avis`;
        const titre = liste.length === 1 ? 'Nouvel avis client' : 'Nouveaux avis clients';
        const corps =
          liste.length === 1
            ? `${'★'.repeat(premier.note)}${'☆'.repeat(5 - premier.note)} sur « ${premier.produit_nom} »`
            : `${liste.length} nouveaux avis publiés sur vos produits`;
        try {
          await PushService.sendToVendeur(vendeurId, { title: titre, body: corps, url: chemin });
          if (premier.vendeur_telephone) {
            await WhatsAppService.sendCustomMessage(
              premier.vendeur_telephone,
              `⭐ *${titre}*\n\n${corps}.\n\nLisez et répondez depuis votre espace vendeur :\n${frontend()}${chemin}`
            );
          }
        } catch (err) {
          logger.warn(`[AvisService] Notification du vendeur ${vendeurId} non envoyée:`, err);
        }
      }
    } catch (err) {
      logger.warn('[AvisService] Notifications vendeur des avis publiés non envoyées:', err);
    }
  }
}
