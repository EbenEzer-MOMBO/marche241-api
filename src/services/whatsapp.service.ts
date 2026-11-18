import { logger } from '../utils/logger';
import {
  META_TEMPLATES,
  OrderArticleLike,
  TemplateComponent,
  buildAnnulationComponents,
  buildBienvenueVendeurComponents,
  buildBilletsComponents,
  buildInvitationAvisComponents,
  buildConfirmationClientComponents,
  buildConfirmationVendeurComponents,
  buildExpeditionComponents,
  buildLivraisonComponents,
  formatDeliveryAddress,
  formatOrderDetails,
} from './whatsapp-templates';

/**
 * Service d'envoi de messages WhatsApp
 * Tous les envois passent par les templates Meta Cloud API.
 * GREEN-API n'est conservé que pour le contrôle d'existence d'un numéro WhatsApp (aucun envoi).
 */

interface MetaMessageResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string; code?: number };
}

const META_TEMPLATE_STATUSES = new Set(['confirmee', 'expedie', 'livree', 'annulee']);

export interface MessageData {
  clientNom: string;
  clientTelephone: string;
  numeroCommande: string;
  boutiqueName: string;
  boutiqueTelephone?: string;
  boutiqueSlug?: string;
  total: number;
  fraisLivraison: number;
  clientAdresse?: string;
  clientVille?: string;
  clientCommune?: string;
  motifAnnulation?: string;
  montantRembourse?: number;
  articles?: OrderArticleLike[];
  montantPaye?: number;
}

export interface VendeurOrderNotificationData {
  numeroCommande: string;
  clientNom: string;
  total: number;
  nombreArticles: number;
  articles?: OrderArticleLike[];
  montantPaye?: number;
  clientAdresse?: string;
  clientVille?: string;
  clientCommune?: string;
}

export class WhatsAppService {
  // GREEN-API : uniquement checkWhatsapp (jamais d'envoi de message)
  private static idInstance = process.env.GREEN_API_ID_INSTANCE;
  private static apiTokenInstance = process.env.GREEN_API_TOKEN;
  private static apiUrl = process.env.GREEN_API_URL || 'https://api.green-api.com';

  private static metaAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private static metaPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private static metaGraphVersion = process.env.META_WHATSAPP_GRAPH_VERSION || 'v21.0';

  /**
   * Vérifie si GREEN-API est configuré (contrôle de numéro uniquement)
   */
  static isConfigured(): boolean {
    return !!(this.idInstance && this.apiTokenInstance);
  }

  /**
   * Vérifie si Meta Cloud API est configuré (templates transactionnels)
   */
  static isMetaConfigured(): boolean {
    return !!(this.metaAccessToken && this.metaPhoneNumberId);
  }

  /**
   * Formate un numéro en digits internationaux (sans + / @c.us)
   */
  static formatPhoneDigits(phone: string): string {
    let cleaned = phone.replace(/[^\d+]/g, '').replace('+', '');

    if (cleaned.startsWith('0')) {
      cleaned = '241' + cleaned.substring(1);
    }

    if (cleaned.length <= 9) {
      cleaned = '241' + cleaned;
    }

    return cleaned;
  }

  /**
   * Numéro au format d'affichage `241XXXXXXXX@c.us` (réponses d'API uniquement)
   */
  static formatPhoneNumber(phone: string): string {
    return `${this.formatPhoneDigits(phone)}@c.us`;
  }

  /**
   * Envoie un template Meta Cloud API
   */
  static async sendTemplateMessage(
    phone: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[] = []
  ): Promise<string | null> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré. Variables WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID requises.');
      return null;
    }

    const to = this.formatPhoneDigits(phone);
    const url = `https://graph.facebook.com/${this.metaGraphVersion}/${this.metaPhoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components.length > 0) {
      (payload.template as Record<string, unknown>).components = components;
    }

    logger.debug(`[WhatsAppService] Envoi template Meta "${templateName}" à ${to}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.metaAccessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as MetaMessageResponse;

      if (!response.ok) {
        logger.error(
          `[WhatsAppService] Erreur Meta HTTP ${response.status}:`,
          data.error?.message || JSON.stringify(data)
        );
        return null;
      }

      const messageId = data.messages?.[0]?.id ?? null;
      logger.debug(`[WhatsAppService] Template Meta envoyé. ID: ${messageId}`);
      return messageId;
    } catch (error: any) {
      logger.error('[WhatsAppService] Erreur lors de l\'envoi du template Meta:', error.message);
      return null;
    }
  }

  private static resolveAdresseLivraison(data: MessageData | VendeurOrderNotificationData): string {
    return formatDeliveryAddress({
      adresse: data.clientAdresse,
      commune: data.clientCommune,
      ville: data.clientVille,
    });
  }

  private static async sendMetaOrderStatus(
    statut: string,
    data: MessageData
  ): Promise<string | null> {
    const details = formatOrderDetails(data.articles);
    const adresseLivraison = this.resolveAdresseLivraison(data);
    const montantPaye = data.montantPaye ?? 0;

    if (statut === 'confirmee') {
      const tpl = META_TEMPLATES.confirmationClient;
      return this.sendTemplateMessage(
        data.clientTelephone,
        tpl.name,
        tpl.language,
        buildConfirmationClientComponents({
          numeroCommande: data.numeroCommande,
          details,
          total: data.total,
          montantPaye,
          adresseLivraison,
          contactBoutique: data.boutiqueTelephone || data.boutiqueName,
        })
      );
    }

    if (statut === 'expedie') {
      const tpl = META_TEMPLATES.expedition;
      return this.sendTemplateMessage(
        data.clientTelephone,
        tpl.name,
        tpl.language,
        buildExpeditionComponents({
          numeroCommande: data.numeroCommande,
          clientNom: data.clientNom,
          adresseLivraison,
        })
      );
    }

    if (statut === 'livree') {
      const tpl = META_TEMPLATES.livraison;
      return this.sendTemplateMessage(
        data.clientTelephone,
        tpl.name,
        tpl.language,
        buildLivraisonComponents({
          clientNom: data.clientNom,
          numeroCommande: data.numeroCommande,
          boutiqueName: data.boutiqueName,
        })
      );
    }

    if (statut === 'annulee') {
      const tpl = META_TEMPLATES.annulation;
      return this.sendTemplateMessage(
        data.clientTelephone,
        tpl.name,
        tpl.language,
        buildAnnulationComponents({
          clientNom: data.clientNom,
          boutiqueSlug: data.boutiqueSlug || 'boutiques',
        })
      );
    }

    return null;
  }

  /**
   * Envoie une notification de changement de statut de commande
   * Template Meta pour confirmee / expedie / livree / annulee ; aucun envoi pour les autres statuts.
   */
  static async sendOrderStatusNotification(
    statut: string,
    data: MessageData
  ): Promise<string | null> {
    if (!META_TEMPLATE_STATUSES.has(statut)) {
      logger.debug(`[WhatsAppService] Pas de template Meta pour le statut: ${statut}`);
      return null;
    }
    if (!this.isMetaConfigured()) {
      logger.warn(`[WhatsAppService] Meta non configuré — notification statut ${statut} non envoyée`);
      return null;
    }

    return this.sendMetaOrderStatus(statut, data);
  }

  /**
   * Notifie l'acheteur d'un échec / expiration de tentative de paiement (Meta uniquement)
   */
  static async notifyPaymentFailed(phone: string): Promise<string | null> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré — tentative_de_paiement_echouee non envoyée');
      return null;
    }

    const tpl = META_TEMPLATES.paiementEchoue;
    return this.sendTemplateMessage(phone, tpl.name, tpl.language, []);
  }

  /**
   * Template Meta `billets_commande`.
   * Bouton URL : {FRONTEND}/billets/{{1}} avec le jeton public.
   */
  static async sendBilletsLink(
    phone: string,
    data: {
      clientNom: string;
      evenementNom: string;
      numeroCommande: string;
      jeton: string;
    }
  ): Promise<string | null> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré — billets_commande non envoyé');
      return null;
    }

    const tpl = META_TEMPLATES.billets;
    return this.sendTemplateMessage(
      phone,
      tpl.name,
      tpl.language,
      buildBilletsComponents(data)
    );
  }

  /**
   * Invitation à laisser un avis : template Meta `invitation_avis`.
   * Renvoie le canal utilisé ('meta') ou 'echec'.
   */
  static async sendInvitationAvis(
    phone: string,
    data: { prenom: string; numeroCommande: string; boutiqueNom: string; jeton: string; relance?: boolean }
  ): Promise<'meta' | 'echec'> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré — invitation_avis non envoyée');
      return 'echec';
    }

    const tpl = META_TEMPLATES.invitationAvis;
    const metaId = await this.sendTemplateMessage(
      phone,
      tpl.name,
      tpl.language,
      buildInvitationAvisComponents(data)
    );
    return metaId ? 'meta' : 'echec';
  }

  /**
   * Message de bienvenue à un nouveau vendeur (template Meta `message_bienvenue_nouveaux_vendeurs`).
   */
  static async sendBienvenueVendeur(phone: string, nom: string): Promise<string | null> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré — message de bienvenue vendeur non envoyé');
      return null;
    }

    const prenom = nom.trim().split(/\s+/)[0] || nom.trim();
    const tpl = META_TEMPLATES.bienvenueVendeur;
    return this.sendTemplateMessage(phone, tpl.name, tpl.language, buildBienvenueVendeurComponents({ prenom }));
  }

  /**
   * Notifie le vendeur d'une nouvelle commande (template Meta)
   */
  static async notifyVendeurNewOrder(
    vendeurTelephone: string,
    data: VendeurOrderNotificationData
  ): Promise<string | null> {
    if (!this.isMetaConfigured()) {
      logger.warn('[WhatsAppService] Meta non configuré — notification vendeur non envoyée');
      return null;
    }

    const tpl = META_TEMPLATES.confirmationVendeur;
    return this.sendTemplateMessage(
      vendeurTelephone,
      tpl.name,
      tpl.language,
      buildConfirmationVendeurComponents({
        numeroCommande: data.numeroCommande,
        clientNom: data.clientNom,
        details: formatOrderDetails(data.articles),
        total: data.total,
        montantPaye: data.montantPaye ?? 0,
        adresseLivraison: this.resolveAdresseLivraison(data),
      })
    );
  }

  private static checkNumberCache = new Map<string, { existsWhatsapp: boolean; expiresAt: number }>();
  private static readonly CHECK_NUMBER_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Vérifie si un numéro de téléphone dispose d'un compte WhatsApp (GREEN-API)
   */
  static async checkWhatsAppNumber(phone: string): Promise<{ existsWhatsapp: boolean } | null> {
    if (!this.isConfigured()) {
      logger.warn('[WhatsAppService] GREEN-API non configuré. Variables GREEN_API_ID_INSTANCE et GREEN_API_TOKEN requises.');
      return null;
    }

    const cleanDigits = this.formatPhoneDigits(phone);

    const cached = this.checkNumberCache.get(cleanDigits);
    if (cached && Date.now() < cached.expiresAt) {
      return { existsWhatsapp: cached.existsWhatsapp };
    }

    const url = `${this.apiUrl}/waInstance${this.idInstance}/checkWhatsapp/${this.apiTokenInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: parseInt(cleanDigits, 10)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[WhatsAppService] Erreur HTTP lors de la vérification ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json() as { existsWhatsapp: boolean };
      this.checkNumberCache.set(cleanDigits, {
        existsWhatsapp: data.existsWhatsapp,
        expiresAt: Date.now() + this.CHECK_NUMBER_TTL_MS
      });
      return data;
    } catch (error: any) {
      logger.error('[WhatsAppService] Erreur lors de la vérification WhatsApp:', error.message);
      return null;
    }
  }
}
