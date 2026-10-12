import { AvisInvitationModel, AvisModel, AvisParametresModel, InvitationCreee } from '../models/avis.model';
import { prenomClient } from '../lib/avis/auteur';
import { WhatsAppService } from './whatsapp.service';
import { PushService } from './push.service';
import { notifier } from './telegram.service';
import { logger } from '../utils/logger';

/** Taille des lots d'envoi du cron (limite le temps d'exécution et le débit WhatsApp). */
const TAILLE_LOT = 50;

export interface BilanInvitationsAvis {
  actif: boolean;
  invitations: number;
  relances: number;
  echecs: number;
}

const frontend = (): string => (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');

async function envoyer(invitation: InvitationCreee, relance: boolean): Promise<boolean> {
  const canal = await WhatsAppService.sendInvitationAvis(invitation.client_telephone, {
    prenom: prenomClient(invitation.client_nom),
    numeroCommande: invitation.numero_commande,
    boutiqueNom: invitation.boutique_nom,
    jeton: invitation.jeton,
    relance
  }).catch((err) => {
    logger.error(`[AvisService] Envoi invitation commande ${invitation.commande_id} impossible:`, err);
    return 'echec' as const;
  });
  await AvisInvitationModel.marquerEnvoi(invitation.invitation_id, canal, relance);
  return canal !== 'echec';
}

export class AvisService {
  /**
   * Cron : crée et envoie les invitations dues (commandes livrées depuis `delai_invitation_jours`),
   * puis les relances. Sans effet si le module est désactivé (kill switch).
   */
  static async envoyerInvitations(): Promise<BilanInvitationsAvis> {
    const parametres = await AvisParametresModel.lire();
    const bilan: BilanInvitationsAvis = { actif: parametres.actif, invitations: 0, relances: 0, echecs: 0 };
    if (!parametres.actif) return bilan;

    const commandes = await AvisInvitationModel.commandesAInviter(parametres.delai_invitation_jours, TAILLE_LOT);
    for (const commande of commandes) {
      const invitation = await AvisInvitationModel.creer(commande, parametres.validite_jeton_jours);
      if (!invitation) continue;
      if (await envoyer(invitation, false)) bilan.invitations += 1;
      else bilan.echecs += 1;
    }

    const ecart = parametres.relance_jours - parametres.delai_invitation_jours;
    if (parametres.relance_jours > 0 && ecart > 0) {
      const relances = await AvisInvitationModel.relancer(ecart, parametres.validite_jeton_jours, TAILLE_LOT);
      for (const invitation of relances) {
        if (await envoyer(invitation, true)) bilan.relances += 1;
        else bilan.echecs += 1;
      }
    }

    logger.info(`[AvisService] Invitations : ${bilan.invitations} envoyée(s), ${bilan.relances} relance(s), ${bilan.echecs} échec(s)`);
    return bilan;
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

  /** Avis publié : push web + WhatsApp au vendeur. Ne lève jamais (la modération ne doit pas échouer pour ça). */
  static async notifierVendeurAvisPublie(avisId: number): Promise<void> {
    try {
      const ctx = await AvisModel.contexteNotification(avisId);
      if (!ctx) return;
      const etoiles = '★'.repeat(ctx.note) + '☆'.repeat(5 - ctx.note);
      const url = `${frontend()}/admin/${ctx.boutique_slug}/avis`;
      await PushService.sendToVendeur(ctx.vendeur_id, {
        title: 'Nouvel avis client',
        body: `${etoiles} sur « ${ctx.produit_nom} »`,
        url: `/admin/${ctx.boutique_slug}/avis`
      });
      if (ctx.vendeur_telephone) {
        await WhatsAppService.sendCustomMessage(
          ctx.vendeur_telephone,
          `⭐ *Nouvel avis client*\n\n${etoiles} sur *${ctx.produit_nom}*.\n\nLisez-le et répondez depuis votre espace vendeur :\n${url}`
        );
      }
    } catch (err) {
      logger.warn(`[AvisService] Notification vendeur de l'avis ${avisId} non envoyée:`, err);
    }
  }
}
