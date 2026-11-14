import { CommandeModel, CommandeLivraisonAuto } from '../models/commande.model';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { PushService } from './push.service';
import { formaterFcfa } from '../lib/boost/devis';
import {
  DecisionLivraisonAuto,
  ParametresLivraisonAuto,
  calendrierRappel,
  decisionLivraisonAuto,
  lireParametresLivraisonAuto,
  livraisonAutoActive
} from '../lib/commande/livraison-auto';
import { logger } from '../utils/logger';

/** Taille du lot examiné à chaque appel du cron (les plus anciennes confirmations d'abord). */
const TAILLE_LOT = 50;


export interface BilanLivraisonAuto {
  actif: boolean;
  simulation: boolean;
  examinees: number;
  rappels_1: number;
  rappels_2: number;
  livrees: number;
  /** Rappels comptés mais dont l'e-mail n'est pas parti (pas d'adresse ou échec Resend) : le push a servi de repli. */
  rappels_sans_email: number;
  /** Vendeurs injoignables (ni e-mail ni push) : rappel non compté, réessayé au prochain appel, commande non livrée. */
  non_joignables: number;
  erreurs: number;
  /** Renseigné en simulation seulement : ce qui serait fait. */
  details?: { numero_commande: string; action: DecisionLivraisonAuto }[];
}

const frontend = (): string => (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');

const lienCommandes = (slug: string): string => `${frontend()}/admin/${slug}/orders`;

const formaterDate = (date: Date): string =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Libreville' }).format(date);

/**
 * Prévient le vendeur par e-mail et par push. Renvoie quels canaux ont abouti (aucun = le vendeur
 * n'a rien reçu : le rappel ne doit alors pas compter). Ne lève jamais.
 */
async function prevenirVendeur(
  commande: CommandeLivraisonAuto,
  rappel: 1 | 2,
  maintenant: Date,
  parametres: ParametresLivraisonAuto
): Promise<{ email: boolean; push: boolean }> {
  const { dateLivraison, joursRestants } = calendrierRappel(
    rappel,
    new Date(commande.date_confirmation),
    maintenant,
    parametres
  );
  let emailEnvoye = false;
  let pushEnvoye = false;

  if (commande.vendeur_email) {
    try {
      await EmailService.envoyerRappelLivraisonAuto(commande.vendeur_email, {
        vendeurNom: commande.vendeur_nom || 'vendeur',
        boutiqueNom: commande.boutique_nom,
        numeroCommande: commande.numero_commande,
        clientNom: commande.client_nom,
        total: formaterFcfa(commande.total),
        rappel,
        joursRestants,
        dateLivraisonAuto: formaterDate(dateLivraison),
        lienCommandes: lienCommandes(commande.boutique_slug)
      });
      emailEnvoye = true;
    } catch (erreur: any) {
      logger.error(`[LivraisonAuto] E-mail rappel ${rappel} commande ${commande.numero_commande} impossible:`, erreur.message);
    }
  }

  try {
    const envoyes = await PushService.sendToVendeur(commande.vendeur_id, {
      title: `Commande #${commande.numero_commande}`,
      body: `Sans action de votre part, elle sera marquée livrée ${joursRestants <= 1 ? 'demain' : `dans ${joursRestants} jours`}.`,
      url: `/admin/${commande.boutique_slug}/orders`
    });
    pushEnvoye = envoyes > 0;
  } catch (erreur: any) {
    logger.error(`[LivraisonAuto] Push rappel commande ${commande.numero_commande} impossible:`, erreur.message);
  }

  return { email: emailEnvoye, push: pushEnvoye };
}

/** Notifie le client (WhatsApp) et le vendeur (push) après le passage en livrée, comme un passage manuel. Ne lève jamais. */
async function notifierLivraison(commandeId: number): Promise<void> {
  const commande = await CommandeModel.getCommandeById(commandeId);
  if (!commande) return;

  if (commande.client_telephone) {
    try {
      const articles = commande.articles || (await CommandeModel.getCommandeArticlesDetails(commandeId));
      await WhatsAppService.sendOrderStatusNotification('livree', {
        clientNom: commande.client_nom || 'Client',
        clientTelephone: commande.client_telephone,
        numeroCommande: commande.numero_commande,
        boutiqueName: commande.boutique?.nom || 'La boutique',
        boutiqueTelephone: commande.boutique?.telephone,
        boutiqueSlug: (commande.boutique as any)?.slug,
        total: commande.total,
        fraisLivraison: commande.frais_livraison || 0,
        clientAdresse: commande.client_adresse,
        clientVille: commande.client_ville,
        clientCommune: commande.client_commune,
        articles,
        montantPaye: commande.montant_paye ?? 0
      });
    } catch (erreur: any) {
      logger.error(`[LivraisonAuto] WhatsApp livraison commande ${commande.numero_commande} impossible:`, erreur.message);
    }
  }

  const vendeurId = (commande.boutique as any)?.vendeur_id;
  if (vendeurId) {
    try {
      await PushService.sendToVendeur(vendeurId, {
        title: `Commande #${commande.numero_commande}`,
        body: 'Statut mis à jour : livrée (automatiquement)',
        url: `/admin/${(commande.boutique as any)?.slug || ''}/orders`
      });
    } catch (erreur: any) {
      logger.error(`[LivraisonAuto] Push livraison commande ${commande.numero_commande} impossible:`, erreur.message);
    }
  }
}

export class LivraisonAutoService {
  /**
   * Cron : prévient le vendeur 2 fois (J+7 puis J+9 après la confirmation) puis passe en « livrée »
   * les commandes « confirmées » à J+10. Idempotent : les compteurs et les mises à jour conditionnelles
   * empêchent qu'un second appel (ou un appel simultané) renvoie un rappel ou re-notifie une livraison.
   * Avec `simulation`, ne fait que lister ce qui serait fait.
   */
  static async executer(options: { simulation?: boolean } = {}): Promise<BilanLivraisonAuto> {
    const simulation = options.simulation === true;
    const bilan: BilanLivraisonAuto = {
      actif: livraisonAutoActive(),
      simulation,
      examinees: 0,
      rappels_1: 0,
      rappels_2: 0,
      livrees: 0,
      rappels_sans_email: 0,
      non_joignables: 0,
      erreurs: 0,
      ...(simulation ? { details: [] } : {})
    };
    if (!bilan.actif) return bilan;

    const parametres = lireParametresLivraisonAuto();
    const maintenant = new Date();
    const commandes = await CommandeModel.getCommandesPourLivraisonAuto(
      parametres.joursRappel1,
      parametres.delaiMinApresRappelHeures,
      TAILLE_LOT
    );
    bilan.examinees = commandes.length;

    for (const commande of commandes) {
      const action = decisionLivraisonAuto(
        {
          rappelsEnvoyes: commande.rappels_livraison_auto,
          dateConfirmation: commande.date_confirmation ? new Date(commande.date_confirmation) : null,
          dateDernierRappel: commande.date_dernier_rappel_livraison_auto
            ? new Date(commande.date_dernier_rappel_livraison_auto)
            : null,
          maintenant
        },
        parametres
      );
      if (action === 'rien') continue;

      if (simulation) {
        bilan.details?.push({ numero_commande: commande.numero_commande, action });
        continue;
      }

      try {
        if (action === 'livrer') {
          if (await CommandeModel.marquerLivreeAuto(commande.id)) {
            bilan.livrees += 1;
            await notifierLivraison(commande.id);
          }
          continue;
        }

        const rappel = action === 'rappel_1' ? 1 : 2;
        // Réservation avant l'envoi : un appel simultané du cron ne renvoie pas le même rappel
        if (!(await CommandeModel.reserverRappelLivraisonAuto(commande.id, commande.rappels_livraison_auto))) continue;
        const canaux = await prevenirVendeur(commande, rappel, maintenant, parametres);
        if (!canaux.email && !canaux.push) {
          // Le vendeur n'a rien reçu : le rappel ne compte pas, la commande ne sera pas livrée sans préavis
          await CommandeModel.libererRappelLivraisonAuto(
            commande.id,
            commande.rappels_livraison_auto + 1,
            commande.date_dernier_rappel_livraison_auto ? new Date(commande.date_dernier_rappel_livraison_auto) : null
          );
          bilan.non_joignables += 1;
          continue;
        }
        if (rappel === 1) bilan.rappels_1 += 1;
        else bilan.rappels_2 += 1;
        if (!canaux.email) bilan.rappels_sans_email += 1;
      } catch (erreur: any) {
        bilan.erreurs += 1;
        logger.error(`[LivraisonAuto] Commande ${commande.numero_commande} : ${erreur.message}`);
      }
    }

    logger.info(
      `[LivraisonAuto] ${bilan.examinees} examinée(s) : ${bilan.rappels_1} rappel(s) 1, ${bilan.rappels_2} rappel(s) 2, ${bilan.livrees} livrée(s), ${bilan.erreurs} erreur(s)`
    );
    return bilan;
  }
}
