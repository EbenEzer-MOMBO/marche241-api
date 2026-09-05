import { logger } from '../utils/logger';
import {
  affilieBienvenueTemplate,
  affilieCodeConnexionTemplate,
  affilieCommissionTemplate,
  vendeurBienvenueTemplate,
  vendeurBoutiqueActiveeTemplate,
  vendeurBoutiqueBadgeVerifieTemplate,
  vendeurBoutiqueRemiseEnAttenteTemplate,
  vendeurBoutiqueSuspendueTemplate,
  vendeurCodeConnexionTemplate,
  vendeurCodeInscriptionTemplate,
} from './email-templates';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface ResendEmailResponse {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Envoi d'emails transactionnels via l'API HTTP de Resend (pas de SMTP,
 * pour rester compatible avec les restrictions sortantes de Render).
 */
export class EmailService {
  static initialize(): void {
    if (!process.env.RESEND_API_KEY) {
      logger.debug('⚠️ RESEND_API_KEY non configurée - Emails désactivés (mode simulation)');
      return;
    }
    logger.debug('✅ Service email Resend configuré');
  }

  private static async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.MAIL_FROM_ADDRESS || 'noreply@marche241.ga';
    const fromName = process.env.MAIL_FROM_NAME || 'Marché241';

    if (!apiKey) {
      logger.debug(`📧 Simulation envoi email (RESEND_API_KEY non configurée) vers ${to} — sujet: ${subject}`);
      return;
    }

    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to,
          subject,
          html,
          text,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as ResendEmailResponse;

      if (!response.ok) {
        throw new Error(body.message || `Resend a répondu avec le statut ${response.status}`);
      }

      logger.debug(`[EmailService] Email envoyé avec succès à ${to} (id: ${body.id})`);
    } catch (error: any) {
      logger.error('[EmailService] Exception lors de l\'envoi de l\'email:', error);
      throw new Error(`Erreur lors de l'envoi de l'email: ${error.message}`);
    }
  }

  /** Code de vérification envoyé lors de la création d'un compte vendeur. */
  static async envoyerCodeInscription(email: string, code: string, nom?: string): Promise<void> {
    const { subject, html, text } = vendeurCodeInscriptionTemplate({ nom, code });
    await this.send(email, subject, html, text);
  }

  /** Code de vérification envoyé lors d'une connexion vendeur. */
  static async envoyerCodeConnexion(email: string, code: string, contexte?: string): Promise<void> {
    const { subject, html, text } = vendeurCodeConnexionTemplate({ code, contexte });
    await this.send(email, subject, html, text);
  }

  /** Email de bienvenue envoyé lors de la première vérification réussie. */
  static async envoyerEmailBienvenue(email: string, nom: string, boutiqueSlug?: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = vendeurBienvenueTemplate({
      nom,
      boutiqueUrl: boutiqueSlug ? `${frontendUrl}/${boutiqueSlug}` : frontendUrl,
      dashboardProduitsUrl: `${frontendUrl}/dashboard/produits`,
    });
    await this.send(email, subject, html, text);
  }

  /** Boutique validée par l'équipe et désormais visible dans l'annuaire. */
  static async envoyerBoutiqueActivee(email: string, boutiqueNom: string, boutiqueSlug: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = vendeurBoutiqueActiveeTemplate({
      boutiqueNom,
      boutiqueUrl: `${frontendUrl}/${boutiqueSlug}`,
      dateActivation: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    await this.send(email, subject, html, text);
  }

  /** Boutique suspendue par l'équipe (retirée de l'annuaire). */
  static async envoyerBoutiqueSuspendue(email: string, boutiqueNom: string, motif: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = vendeurBoutiqueSuspendueTemplate({
      boutiqueNom,
      motif,
      dateSuspension: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      contestationUrl: `${frontendUrl}/dashboard/conformite`,
    });
    await this.send(email, subject, html, text);
  }

  /** Boutique repassée en vérification après modification (ex: paiement). */
  static async envoyerBoutiqueRemiseEnAttente(email: string, boutiqueNom: string, elementAVerifier: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = vendeurBoutiqueRemiseEnAttenteTemplate({
      boutiqueNom,
      elementAVerifier,
      depuisLe: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      dashboardBoutiqueUrl: `${frontendUrl}/dashboard/boutique`,
    });
    await this.send(email, subject, html, text);
  }

  /** Badge de vérification attribué manuellement par un admin. */
  static async envoyerBoutiqueBadgeVerifie(email: string, boutiqueNom: string, boutiqueSlug: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = vendeurBoutiqueBadgeVerifieTemplate({
      boutiqueNom,
      boutiqueUrl: `${frontendUrl}/${boutiqueSlug}`,
      dateAttribution: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    await this.send(email, subject, html, text);
  }

  /** Email de bienvenue envoyé à l'inscription d'un affilié, avec son code et son lien. */
  static async envoyerAffilieBienvenue(email: string, nom: string, code: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = affilieBienvenueTemplate({
      nom,
      code,
      lienPrincipal: `${frontendUrl}/?ref=${code}`,
      dashboardUrl: `${frontendUrl}/affiliation/tableau-de-bord`,
    });
    await this.send(email, subject, html, text);
  }

  /** Notifie un affilié qu'une commission vient de lui être créditée. */
  static async envoyerAffilieCommission(
    email: string,
    nom: string,
    numeroCommande: string,
    montantCommission: number
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
    const { subject, html, text } = affilieCommissionTemplate({
      nom,
      numeroCommande,
      montantCommission,
      dashboardUrl: `${frontendUrl}/affiliation/tableau-de-bord`,
    });
    await this.send(email, subject, html, text);
  }

  /** Code de connexion OTP pour le mini dashboard affilié. */
  static async envoyerAffilieCodeConnexion(email: string, code: string): Promise<void> {
    const { subject, html, text } = affilieCodeConnexionTemplate({ code });
    await this.send(email, subject, html, text);
  }
}
