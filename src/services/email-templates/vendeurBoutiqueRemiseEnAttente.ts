import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoutiqueRemiseEnAttenteData {
  boutiqueNom: string;
  elementAVerifier: string;
  depuisLe: string;
  dashboardBoutiqueUrl: string;
}

export function vendeurBoutiqueRemiseEnAttenteTemplate({
  boutiqueNom,
  elementAVerifier,
  depuisLe,
  dashboardBoutiqueUrl,
}: VendeurBoutiqueRemiseEnAttenteData): { subject: string; html: string; text: string } {
  const contentRows = [
    badge({ label: 'En attente de validation', background: '#fdf3e7', color: '#b45309' }),
    spacer(20),
    heading('Votre boutique est en attente de validation'),
    spacer(20),
    paragraph(
      `Suite à une modification de vos informations, la boutique <strong style="color:#111827">${boutiqueNom}</strong> repasse en vérification. Elle est temporairement masquée de l'annuaire.`
    ),
    spacer(20),
    infoTable([
      { label: 'Statut', value: 'En attente' },
      { label: 'Élément à vérifier', value: elementAVerifier },
      { label: 'Depuis le', value: depuisLe },
      { label: 'Délai habituel', value: '24 à 48 heures' },
    ]),
    spacer(20),
    ctaButton(dashboardBoutiqueUrl, 'Compléter mon dossier', 'secondary'),
    spacer(20),
    note("Votre lien reste actif pour vos clients directs. Seule la présence dans l'annuaire est en pause."),
  ].join('\n');

  return {
    subject: 'Votre boutique est en attente de validation',
    html: renderEmailLayout({
      preheader: 'Vérification en cours — votre boutique est temporairement masquée.',
      kicker: 'Statut boutique',
      contentRows,
    }),
    text: `La boutique ${boutiqueNom} repasse en vérification depuis le ${depuisLe} (${elementAVerifier}). Complétez votre dossier : ${dashboardBoutiqueUrl}`,
  };
}
