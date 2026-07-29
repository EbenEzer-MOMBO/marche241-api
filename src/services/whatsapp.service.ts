import { logger } from '../utils/logger';
import {
  META_TEMPLATES,
  OrderArticleLike,
  TemplateComponent,
  buildAnnulationComponents,
  buildConfirmationClientComponents,
  buildConfirmationVendeurComponents,
  buildExpeditionComponents,
  buildLivraisonComponents,
  formatDeliveryAddress,
  formatOrderDetails,
} from './whatsapp-templates';

/**
 * Service d'envoi de messages WhatsApp
 * - Templates Meta Cloud API pour confirmation / expédition / livraison / vendeur
 * - GREEN-API pour messages texte (fallback + autres statuts + check-number)
 */

interface WhatsAppMessageResponse {
  idMessage: string;
}

interface MetaMessageResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string; code?: number };
}

const META_TEMPLATE_STATUSES = new Set(['confirmee', 'expedie', 'livree', 'annulee']);

// Pied de page commun pour tous les messages de statut (GREEN-API)
const getFooter = (data: MessageData): string => `
───────────────
*${data.boutiqueName}* 🛍️${data.boutiqueTelephone ? `
Contacter la boutique: ${data.boutiqueTelephone}` : ''}
_Équipe Marché241_`;

// Messages personnalisés pour chaque statut de commande (fallback GREEN-API)
const MESSAGES_STATUT: Record<string, (data: MessageData) => string> = {
  confirmee: (data) => `✅ *Commande confirmée !*

Bonjour ${data.clientNom},

Votre commande *#${data.numeroCommande}* a été confirmée par la boutique *${data.boutiqueName}*.

📦 *Détails :*
• Montant total : ${data.total} FCFA
• Livraison : ${data.fraisLivraison} FCFA

Le vendeur prépare votre commande. Vous serez notifié(e) lors de l'expédition.

Merci pour votre confiance ! 🙏${getFooter(data)}`,

  en_preparation: (data) => `🔧 *Commande en préparation*

Bonjour ${data.clientNom},

Votre commande *#${data.numeroCommande}* est en cours de préparation chez *${data.boutiqueName}*.

Nous vous tiendrons informé(e) de l'avancement.

Bonne journée ! ${getFooter(data)}`,

  expedie: (data) => `🚚 *Commande expédiée !*

Bonjour ${data.clientNom},

Excellente nouvelle ! Votre commande *#${data.numeroCommande}* a été expédiée.

📍 *Adresse de livraison :*
${data.clientAdresse}
${data.clientCommune ? data.clientCommune : ''}

Le livreur vous contactera bientôt pour la livraison.

À très vite ! ${getFooter(data)}`,

  livree: (data) => `🎁 *Commande livrée !*

Bonjour ${data.clientNom},

Votre commande *${data.numeroCommande}* a été livrée avec succès !

Nous espérons que vous êtes satisfait(e) de votre achat chez *${data.boutiqueName}*.

N'hésitez pas à laisser un avis pour aider d'autres clients.

Merci et à bientôt ! ${getFooter(data)}`,

  annulee: (data) => `❌ *Commande annulée*

Bonjour ${data.clientNom},

Nous vous informons que votre commande *${data.numeroCommande}* a été annulée.

${data.motifAnnulation ? `📝 *Motif :* ${data.motifAnnulation}` : ''}

Si vous avez effectué un paiement, le remboursement sera traité sous 48h.

Nous restons à votre disposition.${getFooter(data)}`,

  remboursee: (data) => `💰 *Commande remboursée*

Bonjour ${data.clientNom},

Le remboursement de votre commande *${data.numeroCommande}* a été effectué.

💵 *Montant remboursé :* ${data.montantRembourse || data.total} FCFA

Le montant sera crédité sur votre compte dans un délai de 24 à 72h selon votre opérateur.

Merci de votre compréhension.${getFooter(data)}`
};

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
  private static idInstance = process.env.GREEN_API_ID_INSTANCE;
  private static apiTokenInstance = process.env.GREEN_API_TOKEN;
  private static apiUrl = process.env.GREEN_API_URL || 'https://api.green-api.com';

  private static metaAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private static metaPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private static metaGraphVersion = process.env.META_WHATSAPP_GRAPH_VERSION || 'v21.0';

  /**
   * Vérifie si GREEN-API est configuré (messages texte / check-number)
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
   * Formate un numéro de téléphone pour GREEN-API (ex: 241XXXXXXXX@c.us)
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

  /**
   * Envoie un message WhatsApp texte via GREEN-API
   */
  static async sendMessage(phone: string, message: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('[WhatsAppService] GREEN-API non configuré. Variables GREEN_API_ID_INSTANCE et GREEN_API_TOKEN requises.');
      return null;
    }

    const chatId = this.formatPhoneNumber(phone);
    const url = `${this.apiUrl}/waInstance${this.idInstance}/sendMessage/${this.apiTokenInstance}`;

    logger.debug(`[WhatsAppService] Envoi de message GREEN-API à ${chatId}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId,
          message
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[WhatsAppService] Erreur GREEN-API HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json() as WhatsAppMessageResponse;
      logger.debug(`[WhatsAppService] Message GREEN-API envoyé. ID: ${data.idMessage}`);
      return data.idMessage;
    } catch (error: any) {
      logger.error('[WhatsAppService] Erreur lors de l\'envoi GREEN-API:', error.message);
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

  private static async sendGreenApiOrderStatus(
    statut: string,
    data: MessageData
  ): Promise<string | null> {
    const messageGenerator = MESSAGES_STATUT[statut];

    if (!messageGenerator) {
      logger.debug(`[WhatsAppService] Pas de message défini pour le statut: ${statut}`);
      return null;
    }

    return this.sendMessage(data.clientTelephone, messageGenerator(data));
  }

  /**
   * Envoie une notification de changement de statut de commande
   * Meta template pour confirmee / expedie / livree / annulee, sinon GREEN-API texte
   */
  static async sendOrderStatusNotification(
    statut: string,
    data: MessageData
  ): Promise<string | null> {
    if (META_TEMPLATE_STATUSES.has(statut) && this.isMetaConfigured()) {
      const metaId = await this.sendMetaOrderStatus(statut, data);
      if (metaId) {
        return metaId;
      }
      logger.warn(`[WhatsAppService] Échec Meta pour statut ${statut}, fallback GREEN-API`);
    }

    return this.sendGreenApiOrderStatus(statut, data);
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
   * Envoie un message personnalisé (GREEN-API)
   */
  static async sendCustomMessage(
    phone: string,
    customMessage: string
  ): Promise<string | null> {
    return this.sendMessage(phone, customMessage);
  }

  /**
   * Notifie le vendeur d'une nouvelle commande (template Meta + fallback GREEN-API)
   */
  static async notifyVendeurNewOrder(
    vendeurTelephone: string,
    data: VendeurOrderNotificationData
  ): Promise<string | null> {
    if (this.isMetaConfigured()) {
      const tpl = META_TEMPLATES.confirmationVendeur;
      const metaId = await this.sendTemplateMessage(
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

      if (metaId) {
        return metaId;
      }
      logger.warn('[WhatsAppService] Échec Meta notif vendeur, fallback GREEN-API');
    }

    const message = `🛒 *Nouvelle commande !*

Vous avez reçu une nouvelle commande *#${data.numeroCommande}*.

👤 *Client :* ${data.clientNom}
📦 *Articles :* ${data.nombreArticles}
💰 *Total :* ${data.total} FCFA

Connectez-vous à votre espace vendeur pour traiter cette commande.`;

    return this.sendMessage(vendeurTelephone, message);
  }

  /**
   * Envoie une notification de paiement reçu (GREEN-API texte)
   */
  static async notifyPaymentReceived(
    phone: string,
    data: {
      numeroCommande: string;
      montant: number;
      typePaiement: string;
    }
  ): Promise<string | null> {
    const message = `💳 *Paiement reçu !*

Votre paiement de *${data.montant} FCFA* pour la commande *#${data.numeroCommande}* a été confirmé.

Type : ${data.typePaiement === 'paiement_complet' ? 'Paiement complet' :
        data.typePaiement === 'frais_livraison' ? 'Frais de livraison' :
        data.typePaiement === 'solde_apres_livraison' ? 'Solde après livraison' : data.typePaiement}

Merci pour votre confiance ! 🙏`;

    return this.sendMessage(phone, message);
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
