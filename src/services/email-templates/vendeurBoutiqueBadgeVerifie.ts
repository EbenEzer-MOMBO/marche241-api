import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoutiqueBadgeVerifieData {
  boutiqueNom: string;
  boutiqueUrl: string;
  dateAttribution: string;
}

export function vendeurBoutiqueBadgeVerifieTemplate({
  boutiqueNom,
  boutiqueUrl,
  dateAttribution,
}: VendeurBoutiqueBadgeVerifieData): {
  subject: string;
  html: string;
  text: string;
} {
  const contentRows = [
    badge({ label: 'Boutique vérifiée', background: '#e8f1fb', color: '#1d4ed8' }),
    spacer(20),
    heading('Félicitations, votre boutique est vérifiée'),
    spacer(20),
    paragraph(
      `Votre boutique <strong style="color:#111827">${boutiqueNom}</strong> a reçu le badge de vérification Marché241. Vos clients voient désormais ce badge sur votre fiche et dans l'annuaire.`
    ),
    spacer(20),
    infoTable([
      { label: 'Boutique', value: boutiqueNom },
      { label: 'Badge', value: 'Vérifiée' },
      { label: 'Attribué le', value: dateAttribution },
    ]),
    spacer(20),
    ctaButton(boutiqueUrl, 'Voir ma boutique'),
    spacer(20),
    note('Ce badge renforce la confiance des acheteurs. Continuez à honorer vos commandes et à tenir vos stocks à jour.'),
  ].join('\n');

  return {
    subject: 'Votre boutique a reçu le badge vérifié',
    html: renderEmailLayout({
      preheader: 'Félicitations — votre boutique affiche désormais le badge vérifié Marché241.',
      kicker: 'Badge boutique',
      contentRows,
    }),
    text: `Félicitations, votre boutique ${boutiqueNom} a reçu le badge de vérification le ${dateAttribution}. Consultez-la ici : ${boutiqueUrl}`,
  };
}
