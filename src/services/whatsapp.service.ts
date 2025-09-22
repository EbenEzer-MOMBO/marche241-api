import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template' | 'text';
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters: Array<{
        type: string;
        text: string;
      }>;
    }>;
  };
  text?: {
    body: string;
  };
}

export interface CommandeConfirmation {
  numeroCommande: string;
  nomClient: string;
  montantTotal: number;
  dateCommande: string;
  produits: Array<{
    nom: string;
    quantite: number;
    prix: number;
  }>;
  adresseLivraison?: string;
  telephoneClient: string;
}

export class WhatsAppService {
  private static readonly BASE_URL = 'https://graph.facebook.com/v22.0';
  private static readonly PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '810774175447324';
  private static readonly ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

  /**
   * Envoie un message WhatsApp générique
   */
  static async sendMessage(message: WhatsAppMessage): Promise<any> {
    try {
      if (!this.PHONE_NUMBER_ID || !this.ACCESS_TOKEN) {
        throw new Error('Configuration WhatsApp manquante. Vérifiez WHATSAPP_PHONE_NUMBER_ID et WHATSAPP_ACCESS_TOKEN');
      }

      const url = `${this.BASE_URL}/${this.PHONE_NUMBER_ID}/messages`;
      
      const response = await axios.post(url, message, {
        headers: {
          'Authorization': `Bearer ${this.ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message WhatsApp:', error.response?.data || error.message);
      throw new Error(`Échec de l'envoi WhatsApp: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Envoie un message de confirmation de commande via template WhatsApp
   */
  static async envoyerConfirmationCommande(commande: CommandeConfirmation): Promise<any> {
    try {
      // Formatage du numéro de téléphone (suppression des espaces et caractères spéciaux)
      const numeroFormate = commande.telephoneClient.replace(/[^\d+]/g, '');
      
      // Construction de la liste des produits
      const listeProduits = commande.produits
        .map(p => `• ${p.nom} (x${p.quantite}) - ${p.prix.toLocaleString('fr-FR')} FCFA`)
        .join('\n');

      // Message template pour confirmation de commande
      const message: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: numeroFormate,
        type: 'template',
        template: {
          name: 'confirmation_commande', // Nom du template à créer dans WhatsApp Business
          language: {
            code: 'fr'
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: commande.nomClient
                },
                {
                  type: 'text',
                  text: commande.numeroCommande
                },
                {
                  type: 'text',
                  text: commande.montantTotal.toLocaleString('fr-FR') + ' FCFA'
                },
                {
                  type: 'text',
                  text: listeProduits
                },
                {
                  type: 'text',
                  text: commande.dateCommande
                }
              ]
            }
          ]
        }
      };

      return await this.sendMessage(message);
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de la confirmation de commande:', error.message);
      throw error;
    }
  }

  /**
   * Envoie un message texte simple (pour les comptes sans templates approuvés)
   */
  static async envoyerConfirmationCommandeTexte(commande: CommandeConfirmation): Promise<any> {
    try {
      const numeroFormate = commande.telephoneClient.replace(/[^\d+]/g, '');
      
      const listeProduits = commande.produits
        .map(p => `• ${p.nom} (x${p.quantite}) - ${p.prix.toLocaleString('fr-FR')} FCFA`)
        .join('\n');

      const messageTexte = `🛍️ *Marché 241 - Confirmation de commande*

Bonjour ${commande.nomClient},

Votre commande a été confirmée avec succès !

📋 *Détails de la commande :*
• Numéro : ${commande.numeroCommande}
• Date : ${commande.dateCommande}
• Montant total : ${commande.montantTotal.toLocaleString('fr-FR')} FCFA

🛒 *Produits commandés :*
${listeProduits}

${commande.adresseLivraison ? `📍 *Adresse de livraison :*\n${commande.adresseLivraison}\n\n` : ''}📞 Nous vous contacterons bientôt pour organiser la livraison.

Merci de votre confiance !
L'équipe Marché 241`;

      const message: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: numeroFormate,
        type: 'text',
        text: {
          body: messageTexte
        }
      };

      return await this.sendMessage(message);
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message texte:', error.message);
      throw error;
    }
  }

  /**
   * Envoie une notification de changement de statut de commande
   */
  static async envoyerNotificationStatut(
    telephone: string, 
    numeroCommande: string, 
    nouveauStatut: string, 
    nomClient: string
  ): Promise<any> {
    try {
      const numeroFormate = telephone.replace(/[^\d+]/g, '');
      
      let messageStatut = '';
      let emoji = '';
      
      switch (nouveauStatut.toLowerCase()) {
        case 'en_preparation':
          emoji = '👨‍🍳';
          messageStatut = 'Votre commande est en cours de préparation';
          break;
        case 'prete':
          emoji = '✅';
          messageStatut = 'Votre commande est prête !';
          break;
        case 'en_livraison':
          emoji = '🚚';
          messageStatut = 'Votre commande est en cours de livraison';
          break;
        case 'livree':
          emoji = '🎉';
          messageStatut = 'Votre commande a été livrée avec succès !';
          break;
        case 'annulee':
          emoji = '❌';
          messageStatut = 'Votre commande a été annulée';
          break;
        default:
          emoji = '📋';
          messageStatut = `Statut de votre commande : ${nouveauStatut}`;
      }

      const messageTexte = `${emoji} *Marché 241 - Mise à jour de commande*

Bonjour ${nomClient},

${messageStatut}

📋 Commande : ${numeroCommande}

${nouveauStatut.toLowerCase() === 'livree' ? 
  'Merci de votre confiance ! N\'hésitez pas à nous laisser un avis.' : 
  'Nous vous tiendrons informé(e) de l\'évolution de votre commande.'
}

L'équipe Marché 241`;

      const message: WhatsAppMessage = {
        messaging_product: 'whatsapp',
        to: numeroFormate,
        type: 'text',
        text: {
          body: messageTexte
        }
      };

      return await this.sendMessage(message);
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de la notification de statut:', error.message);
      throw error;
    }
  }

  /**
   * Valide un numéro de téléphone WhatsApp
   */
  static validerNumeroWhatsApp(numero: string): boolean {
    // Supprime tous les caractères non numériques
    const numeroNettoye = numero.replace(/[^\d]/g, '');
    
    // Valide les formats gabonais
    // Format local: 8 chiffres (ex: 77123456)
    // Format international: 11 chiffres commençant par 241 (ex: 24177123456)
    return (numeroNettoye.length === 8 && /^[0-9]{8}$/.test(numeroNettoye)) ||
           (numeroNettoye.length === 11 && numeroNettoye.startsWith('241'));
  }

  /**
   * Formate un numéro de téléphone pour WhatsApp
   */
  static formaterNumeroWhatsApp(numero: string): string {
    // Supprime tous les caractères non numériques (y compris le +)
    let numeroFormate = numero.replace(/[^\d]/g, '');
    
    // Pour le Gabon, s'assurer que le numéro commence par 241
    if (numeroFormate.startsWith('0')) {
      // Remplacer le 0 initial par 241 pour les numéros locaux
      numeroFormate = '241' + numeroFormate.substring(1);
    } else if (!numeroFormate.startsWith('241') && numeroFormate.length === 8) {
      // Ajouter le code pays 241 si c'est un numéro local à 8 chiffres
      numeroFormate = '241' + numeroFormate;
    }
    
    return numeroFormate;
  }
}
