/**
 * Helpers et builders pour les templates Meta WhatsApp transactionnels.
 */

export interface OrderArticleLike {
  nom_produit?: string;
  quantite?: number;
  prix_unitaire?: number;
  sous_total?: number;
}

export interface TemplateTextParameter {
  type: 'text';
  text: string;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: number;
  parameters: TemplateTextParameter[];
}

const META_TEMPLATES = {
  confirmationClient: { name: 'confirmation_de_commande', language: 'fr' },
  expedition: { name: 'commande_expediee', language: 'fr' },
  livraison: { name: 'commande_livree_notification', language: 'fr' },
  confirmationVendeur: { name: 'confirmation_de_commande_vendeur', language: 'fr' },
  annulation: { name: 'commande_annulee_notification', language: 'fr' },
  paiementEchoue: { name: 'tentative_de_paiement_echouee', language: 'fr' },
} as const;

export { META_TEMPLATES };

/**
 * Meta interdit les retours à la ligne / tabulations dans les paramètres de template.
 */
export function sanitizeTemplateParam(value: string | number | null | undefined, fallback = '-'): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {5,}/g, '    ')
    .trim();

  return cleaned.length > 0 ? cleaned : fallback;
}

export function formatAmountXaf(amount: number | null | undefined): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return sanitizeTemplateParam(`${Math.round(value)}`);
}

export function formatOrderDetails(articles: OrderArticleLike[] | undefined): string {
  if (!articles || articles.length === 0) {
    return sanitizeTemplateParam('Aucun article');
  }

  const lines = articles.map((article) => {
    const nom = article.nom_produit || 'Article';
    const qty = article.quantite ?? 1;
    const lineTotal = article.sous_total ?? (article.prix_unitaire ?? 0) * qty;
    return `• ${nom} (x${qty}) - ${Math.round(lineTotal)} XAF`;
  });

  return sanitizeTemplateParam(lines.join(' '));
}

export function formatDeliveryAddress(parts: {
  adresse?: string | null;
  commune?: string | null;
  ville?: string | null;
}): string {
  const chunks = [parts.adresse, parts.commune, parts.ville]
    .map((part) => (part ? String(part).trim() : ''))
    .filter((part) => part.length > 0);

  return sanitizeTemplateParam(chunks.join(', '));
}

function textParams(...values: Array<string | number | null | undefined>): TemplateTextParameter[] {
  return values.map((value) => ({ type: 'text', text: sanitizeTemplateParam(value) }));
}

export function buildConfirmationClientComponents(data: {
  numeroCommande: string;
  details: string;
  total: number;
  montantPaye: number;
  adresseLivraison: string;
  contactBoutique: string;
}): TemplateComponent[] {
  return [
    { type: 'header', parameters: textParams(data.numeroCommande) },
    {
      type: 'body',
      parameters: textParams(
        data.numeroCommande,
        data.details,
        formatAmountXaf(data.total),
        formatAmountXaf(data.montantPaye),
        data.adresseLivraison,
        data.contactBoutique
      ),
    },
  ];
}

export function buildExpeditionComponents(data: {
  numeroCommande: string;
  clientNom: string;
  adresseLivraison: string;
}): TemplateComponent[] {
  return [
    { type: 'header', parameters: textParams(data.numeroCommande) },
    {
      type: 'body',
      parameters: textParams(data.clientNom, data.numeroCommande, data.adresseLivraison),
    },
  ];
}

export function buildLivraisonComponents(data: {
  clientNom: string;
  numeroCommande: string;
  boutiqueName: string;
}): TemplateComponent[] {
  return [
    {
      type: 'body',
      parameters: textParams(data.clientNom, data.numeroCommande, data.boutiqueName),
    },
  ];
}

export function buildConfirmationVendeurComponents(data: {
  numeroCommande: string;
  clientNom: string;
  details: string;
  total: number;
  montantPaye: number;
  adresseLivraison: string;
}): TemplateComponent[] {
  return [
    { type: 'header', parameters: textParams(data.numeroCommande) },
    {
      type: 'body',
      parameters: textParams(
        data.clientNom,
        data.details,
        formatAmountXaf(data.total),
        formatAmountXaf(data.montantPaye),
        data.adresseLivraison
      ),
    },
  ];
}

export function buildAnnulationComponents(data: {
  clientNom: string;
  boutiqueSlug: string;
}): TemplateComponent[] {
  return [
    { type: 'header', parameters: textParams(data.clientNom) },
    {
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: textParams(data.boutiqueSlug),
    },
  ];
}
