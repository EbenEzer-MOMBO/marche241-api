import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurLivraisonAutoData {
  vendeurNom: string;
  boutiqueNom: string;
  numeroCommande: string;
  clientNom: string;
  /** Total déjà formaté (ex. « 25 000 FCFA »). */
  total: string;
  /** 1 = premier avis, 2 = dernier avis (la veille). */
  rappel: 1 | 2;
  /** Jours restants avant le passage automatique en livrée. */
  joursRestants: number;
  /** Date du passage automatique, déjà formatée. */
  dateLivraisonAuto: string;
  lienCommandes: string;
}

const echapper = (valeur: string) =>
  valeur.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** E-mail envoyé au vendeur avant qu'une commande confirmée soit marquée livrée automatiquement. */
export function vendeurLivraisonAutoTemplate(data: VendeurLivraisonAutoData): { subject: string; html: string; text: string } {
  const delai = data.joursRestants <= 1 ? 'demain' : `dans ${data.joursRestants} jours`;
  const dernier = data.rappel === 2;
  const titre = `La commande ${data.numeroCommande} sera marquée livrée ${delai}`;

  const contentRows = [
    badge({
      label: dernier ? 'Dernier rappel' : 'Rappel',
      background: dernier ? '#fee2e2' : '#fef3c7',
      color: dernier ? '#b91c1c' : '#b45309'
    }),
    spacer(20),
    heading(echapper(titre)),
    spacer(20),
    paragraph(
      `Bonjour ${echapper(data.vendeurNom)}, la commande <strong style="color:#111827">${echapper(data.numeroCommande)}</strong> de ${echapper(data.boutiqueNom)} est « confirmée » depuis plusieurs jours sans avoir été marquée livrée.`
    ),
    spacer(12),
    paragraph(
      `Sans action de votre part, elle passera automatiquement au statut « livrée » le <strong style="color:#111827">${echapper(data.dateLivraisonAuto)}</strong> et votre client en sera informé.`
    ),
    spacer(20),
    infoTable([
      { label: 'Commande', value: echapper(data.numeroCommande) },
      { label: 'Client', value: echapper(data.clientNom) },
      { label: 'Total', value: echapper(data.total) }
    ]),
    spacer(20),
    ctaButton(data.lienCommandes, 'Voir mes commandes'),
    spacer(20),
    note(
      "Si la commande n'a pas été livrée, ne la laissez pas passer en livrée : mettez son statut à jour dans votre espace vendeur ou répondez simplement à cet e-mail."
    )
  ].join('\n');

  return {
    subject: titre,
    html: renderEmailLayout({
      preheader: `Sans action de votre part, elle passera en livrée le ${data.dateLivraisonAuto}.`,
      kicker: 'Commandes',
      contentRows
    }),
    text: `Bonjour ${data.vendeurNom}, la commande ${data.numeroCommande} de ${data.boutiqueNom} (client : ${data.clientNom}, total : ${data.total}) est « confirmée » depuis plusieurs jours sans avoir été marquée livrée.\n\nSans action de votre part, elle passera automatiquement au statut « livrée » le ${data.dateLivraisonAuto} et votre client en sera informé.\n\nSi la commande n'a pas été livrée, mettez son statut à jour dans votre espace vendeur ou répondez à cet e-mail.\n\nVoir mes commandes : ${data.lienCommandes}`
  };
}
