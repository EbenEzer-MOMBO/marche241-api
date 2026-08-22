import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoutiqueSuspendueData {
  boutiqueNom: string;
  motif: string;
  dateSuspension: string;
  contestationUrl: string;
}

export function vendeurBoutiqueSuspendueTemplate({ boutiqueNom, motif, dateSuspension, contestationUrl }: VendeurBoutiqueSuspendueData): {
  subject: string;
  html: string;
  text: string;
} {
  const contentRows = [
    badge({ label: 'Boutique suspendue', background: '#fdecec', color: '#b42318' }),
    spacer(20),
    heading('Votre boutique a été suspendue'),
    spacer(20),
    paragraph(
      `Votre boutique <strong style="color:#111827">${boutiqueNom}</strong> n'est plus visible dans l'annuaire. Les commandes en cours restent à honorer.`
    ),
    spacer(20),
    infoTable([
      { label: 'Statut', value: 'Suspendue' },
      { label: 'Motif', value: motif },
      { label: 'Suspendue le', value: dateSuspension },
      { label: 'Délai de réponse', value: '7 jours' },
    ]),
    spacer(20),
    ctaButton(contestationUrl, 'Contester ou corriger', 'secondary'),
    spacer(20),
    note(
      "Vous pensez qu'il s'agit d'une erreur ? Répondez à cet email avec vos éléments, nous réexaminons le dossier sous 48 heures."
    ),
  ].join('\n');

  return {
    subject: 'Votre boutique a été suspendue',
    html: renderEmailLayout({
      preheader: "Votre boutique n'est plus visible — voici la raison et la suite.",
      kicker: 'Statut boutique',
      contentRows,
    }),
    text: `Votre boutique ${boutiqueNom} a été suspendue le ${dateSuspension}. Motif : ${motif}. Pour contester : ${contestationUrl}`,
  };
}
