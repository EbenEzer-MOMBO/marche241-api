import { Commande } from '../lib/database-types';
import { BilletACreer, BilletModel } from '../models/billet.model';
import { ProduitModel } from '../models/produit.model';
import { isProduitEvenement } from '../utils/produit-evenement';
import { logger } from '../utils/logger';

function typeBilletDepuisArticle(article: { variants_selectionnes?: any }): string {
  const selection = article.variants_selectionnes;
  if (selection?.variant?.nom) {
    return String(selection.variant.nom);
  }
  if (selection?.nom) {
    return String(selection.nom);
  }
  return 'Billet';
}

function formatDateEvenement(meta: Record<string, unknown> | undefined): string {
  const raw = meta?.date_debut;
  if (!raw) {
    return '';
  }
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    return String(raw);
  }
  const datePart = date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

export class BilletService {
  static publicUrl(jeton: string): string {
    const frontend = (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');
    return `${frontend}/billets/${jeton}`;
  }

  static async isCommandeEvenement(commande: Commande): Promise<boolean> {
    for (const article of commande.articles || []) {
      const produit = await ProduitModel.getProduitById(article.produit_id);
      if (isProduitEvenement(produit)) {
        return true;
      }
    }
    return false;
  }

  static async emitSiCommandeEvenement(commande: Commande): Promise<string | null> {
    const articles = commande.articles || [];
    if (articles.length === 0) {
      return null;
    }

    const existants = await BilletModel.findByCommandeId(commande.id);
    if (existants.length > 0) {
      return this.publicUrl(existants[0].jeton);
    }

    const aCreer: BilletACreer[] = [];

    for (const article of articles) {
      const produit = await ProduitModel.getProduitById(article.produit_id);
      const variants = produit?.variants as { type?: string } | undefined;
      if (!produit || variants?.type !== 'evenement') {
        continue;
      }

      aCreer.push({
        produit_id: article.produit_id,
        type_billet: typeBilletDepuisArticle(article),
        quantite: article.quantite,
      });
    }

    if (aCreer.length === 0) {
      return null;
    }

    const billets = await BilletModel.emitForCommande(commande.id, aCreer);
    if (billets.length === 0) {
      logger.warn(`[BilletService] Aucun billet émis pour la commande ${commande.id}`);
      return null;
    }

    return this.publicUrl(billets[0].jeton);
  }

  static async payloadPdfParJeton(jeton: string): Promise<{
    evenement: { nom: string; date?: string; lieu?: string; adresse?: string; image?: string };
    billets: Array<{ type_billet: string; numero: number }>;
    jeton: string;
  } | null> {
    const billets = await BilletModel.findByJeton(jeton);
    if (billets.length === 0) {
      return null;
    }

    const premierProduit = await ProduitModel.getProduitById(billets[0].produit_id);
    const meta = (premierProduit?.variants as { meta?: Record<string, unknown> } | undefined)?.meta;

    return {
      evenement: {
        nom: premierProduit?.nom || 'Événement',
        date: formatDateEvenement(meta),
        lieu: meta?.lieu ? String(meta.lieu) : '',
        adresse: meta?.adresse ? String(meta.adresse) : '',
        image: premierProduit?.image_principale || '',
      },
      billets: billets.map((billet) => ({
        type_billet: billet.type_billet,
        numero: billet.numero,
      })),
      jeton,
    };
  }
}
