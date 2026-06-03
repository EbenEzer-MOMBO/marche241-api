/**
 * Service d'envoi de messages WhatsApp via GREEN-API
 * Documentation: https://green-api.com/en/docs/api/sending/SendMessage/
 */

interface WhatsAppMessageResponse {
  idMessage: string;
}

interface WhatsAppError {
  code: number;
  message: string;
}

// Pied de page commun pour tous les messages de statut
const getFooter = (data: MessageData): string => `
───────────────
*${data.boutiqueName}* 🛍️${data.boutiqueTelephone ? `
Contacter la boutique: ${data.boutiqueTelephone}` : ''}
_Équipe Marché241_`;

// Messages personnalisés pour chaque statut de commande
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

interface MessageData {
  clientNom: string;
  clientTelephone: string;
  numeroCommande: string;
  boutiqueName: string;
  boutiqueTelephone?: string;
  total: number;
  fraisLivraison: number;
  clientAdresse?: string;
  clientVille?: string;
  clientCommune?: string;
  motifAnnulation?: string;
  montantRembourse?: number;
}

export class WhatsAppService {
  private static idInstance = process.env.GREEN_API_ID_INSTANCE;
  private static apiTokenInstance = process.env.GREEN_API_TOKEN;
  private static apiUrl = process.env.GREEN_API_URL || 'https://api.green-api.com';

  /**
   * Vérifie si le service WhatsApp est configuré
   */
  static isConfigured(): boolean {
    return !!(this.idInstance && this.apiTokenInstance);
  }

  /**
   * Formate un numéro de téléphone pour WhatsApp
   * @param phone Numéro de téléphone (avec ou sans indicatif)
   * @returns Numéro formaté pour WhatsApp (ex: 241XXXXXXXX@c.us)
   */
  static formatPhoneNumber(phone: string): string {
    // Supprimer tous les caractères non numériques sauf le +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Supprimer le + s'il existe
    cleaned = cleaned.replace('+', '');
    
    // Si le numéro commence par 0, le remplacer par l'indicatif Gabon (241)
    if (cleaned.startsWith('0')) {
      cleaned = '241' + cleaned.substring(1);
    }
    
    // Si le numéro n'a pas d'indicatif (moins de 11 chiffres), ajouter 241
    if (cleaned.length <= 9) {
      cleaned = '241' + cleaned;
    }
    
    return `${cleaned}@c.us`;
  }

  /**
   * Envoie un message WhatsApp
   * @param phone Numéro de téléphone du destinataire
   * @param message Contenu du message
   * @returns ID du message envoyé ou null en cas d'erreur
   */
  static async sendMessage(phone: string, message: string): Promise<string | null> {
    if (!this.isConfigured()) {
      console.warn('[WhatsAppService] Service non configuré. Variables GREEN_API_ID_INSTANCE et GREEN_API_TOKEN requises.');
      return null;
    }

    const chatId = this.formatPhoneNumber(phone);
    const url = `${this.apiUrl}/waInstance${this.idInstance}/sendMessage/${this.apiTokenInstance}`;

    console.log(`[WhatsAppService] Envoi de message à ${chatId}`);

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
        console.error(`[WhatsAppService] Erreur HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json() as WhatsAppMessageResponse;
      console.log(`[WhatsAppService] Message envoyé avec succès. ID: ${data.idMessage}`);
      return data.idMessage;
    } catch (error: any) {
      console.error('[WhatsAppService] Erreur lors de l\'envoi du message:', error.message);
      return null;
    }
  }

  /**
   * Envoie une notification de changement de statut de commande
   * @param statut Nouveau statut de la commande
   * @param data Données de la commande
   * @returns ID du message envoyé ou null
   */
  static async sendOrderStatusNotification(
    statut: string,
    data: MessageData
  ): Promise<string | null> {
    // Vérifier si un message est défini pour ce statut
    const messageGenerator = MESSAGES_STATUT[statut];
    
    if (!messageGenerator) {
      console.log(`[WhatsAppService] Pas de message défini pour le statut: ${statut}`);
      return null;
    }

    const message = messageGenerator(data);
    return this.sendMessage(data.clientTelephone, message);
  }

  /**
   * Envoie un message personnalisé
   * @param phone Numéro de téléphone
   * @param templateName Nom du template (optionnel)
   * @param customMessage Message personnalisé
   */
  static async sendCustomMessage(
    phone: string,
    customMessage: string
  ): Promise<string | null> {
    return this.sendMessage(phone, customMessage);
  }

  /**
   * Envoie une notification au vendeur pour une nouvelle commande
   */
  static async notifyVendeurNewOrder(
    vendeurTelephone: string,
    data: {
      numeroCommande: string;
      clientNom: string;
      total: number;
      nombreArticles: number;
    }
  ): Promise<string | null> {
    const message = `🛒 *Nouvelle commande !*

Vous avez reçu une nouvelle commande *#${data.numeroCommande}*.

👤 *Client :* ${data.clientNom}
📦 *Articles :* ${data.nombreArticles}
💰 *Total :* ${data.total} FCFA

Connectez-vous à votre espace vendeur pour traiter cette commande.`;

    return this.sendMessage(vendeurTelephone, message);
  }

  /**
   * Envoie une notification de paiement reçu
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

  /**
   * Vérifie si un numéro de téléphone dispose d'un compte WhatsApp
   * @param phone Numéro de téléphone
   */
  static async checkWhatsAppNumber(phone: string): Promise<{ existsWhatsapp: boolean } | null> {
    if (!this.isConfigured()) {
      console.warn('[WhatsAppService] Service non configuré. Variables GREEN_API_ID_INSTANCE et GREEN_API_TOKEN requises.');
      return null;
    }

    const formattedChatId = this.formatPhoneNumber(phone);
    const cleanDigits = formattedChatId.split('@')[0]; // ex: "24177123456"

    const url = `${this.apiUrl}/waInstance${this.idInstance}/checkWhatsapp/${this.apiTokenInstance}`;

    console.log(`[WhatsAppService] Vérification WhatsApp pour ${cleanDigits}`);

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
        console.error(`[WhatsAppService] Erreur HTTP lors de la vérification ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json() as { existsWhatsapp: boolean };
      console.log(`[WhatsAppService] Résultat de la vérification pour ${cleanDigits}: ${data.existsWhatsapp}`);
      return data;
    } catch (error: any) {
      console.error('[WhatsAppService] Erreur lors de la vérification WhatsApp:', error.message);
      return null;
    }
  }
}

