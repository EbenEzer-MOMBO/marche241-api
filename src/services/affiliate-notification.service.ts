import { CommissionModel } from '../models/commission.model';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { CommissionAffiliee } from '../lib/database-types';
import { logger } from '../utils/logger';

type CommissionAvecAffilie = CommissionAffiliee & {
  affilie_nom: string;
  affilie_email: string;
  affilie_telephone: string;
  numero_commande?: string;
};

/**
 * Notifie les affiliés des commissions qui viennent de leur être créditées.
 * Exécuté depuis un cron (pas de queue disponible) plutôt qu'à la volée dans
 * le trigger SQL, qui ne peut appeler ni email ni WhatsApp.
 */
export class AffiliateNotificationService {
  static async notifierCommissionsEnAttente(): Promise<{ notifiees: number; erreurs: number }> {
    const commissions = (await CommissionModel.getNonNotifiees()) as CommissionAvecAffilie[];

    let notifiees = 0;
    let erreurs = 0;

    for (const commission of commissions) {
      try {
        const numeroCommande = commission.numero_commande || String(commission.commande_id);

        try {
          await EmailService.envoyerAffilieCommission(
            commission.affilie_email,
            commission.affilie_nom,
            numeroCommande,
            commission.montant_commission
          );
        } catch (emailError) {
          logger.error('[AffiliateNotificationService] Échec email pour commission', commission.id, emailError);
        }

        try {
          await WhatsAppService.notifyAffiliateCommission(commission.affilie_telephone, {
            nomAffilie: commission.affilie_nom,
            numeroCommande,
            montantCommission: commission.montant_commission
          });
        } catch (whatsappError) {
          logger.error('[AffiliateNotificationService] Échec WhatsApp pour commission', commission.id, whatsappError);
        }

        await CommissionModel.marquerNotifiee(commission.id);
        notifiees++;
      } catch (error) {
        logger.error('[AffiliateNotificationService] Erreur lors de la notification de la commission', commission.id, error);
        erreurs++;
      }
    }

    return { notifiees, erreurs };
  }
}
