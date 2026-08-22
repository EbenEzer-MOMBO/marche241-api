import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoutiqueActiveeData {
  boutiqueNom: string;
  boutiqueUrl: string;
  dateActivation: string;
}

export function vendeurBoutiqueActiveeTemplate({ boutiqueNom, boutiqueUrl, dateActivation }: VendeurBoutiqueActiveeData): {
  subject: string;
  html: string;
  text: string;
} {
  const contentRows = [
    badge({ label: 'Boutique activée', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading('Votre boutique est activée'),
    spacer(20),
    paragraph(
      `Votre boutique <strong style="color:#111827">${boutiqueNom}</strong> a été validée par notre équipe. Elle apparaît désormais dans l'annuaire et vos clients peuvent commander.`
    ),
    spacer(20),
    infoTable([
      { label: 'Statut', value: 'Active' },
      { label: "Visible dans l'annuaire", value: 'Oui' },
      { label: 'Paiements', value: 'Airtel Money · Moov Money' },
      { label: 'Activée le', value: dateActivation },
    ]),
    spacer(20),
    ctaButton(boutiqueUrl, 'Voir ma boutique en ligne'),
    spacer(20),
    note('Pensez à vérifier vos stocks : un produit indisponible fait perdre la commande.'),
  ].join('\n');

  return {
    subject: 'Votre boutique est activée',
    html: renderEmailLayout({
      preheader: "Votre boutique est visible dans l'annuaire Marché241.",
      kicker: 'Statut boutique',
      contentRows,
    }),
    text: `Votre boutique ${boutiqueNom} a été activée le ${dateActivation}. Elle est visible dans l'annuaire : ${boutiqueUrl}`,
  };
}
