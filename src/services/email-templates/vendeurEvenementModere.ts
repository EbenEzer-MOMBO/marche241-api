import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

const echapperHtml = (valeur: string) =>
  valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface VendeurEvenementPublieData {
  evenementNom: string;
  evenementUrl: string;
  dateEvenement?: string;
}

export function vendeurEvenementPublieTemplate({
  evenementNom,
  evenementUrl,
  dateEvenement,
}: VendeurEvenementPublieData): { subject: string; html: string; text: string } {
  const nom = echapperHtml(evenementNom);
  const contentRows = [
    badge({ label: 'Événement publié', background: '#ecf6e6', color: '#3f7020' }),
    spacer(20),
    heading('Votre événement est en ligne'),
    spacer(20),
    paragraph(
      `L’équipe Marché241 a validé <strong style="color:#111827">${nom}</strong>. La billetterie est ouverte : vos clients peuvent réserver leurs billets dès maintenant.`
    ),
    spacer(20),
    infoTable([
      { label: 'Événement', value: nom },
      ...(dateEvenement ? [{ label: 'Date', value: echapperHtml(dateEvenement) }] : []),
      { label: 'Statut', value: 'Publié' },
    ]),
    spacer(20),
    ctaButton(evenementUrl, 'Voir la page de l’événement'),
    spacer(20),
    note('Partagez le lien sur WhatsApp et vos réseaux pour lancer les ventes.'),
  ].join('\n');

  return {
    subject: `Votre événement « ${evenementNom} » est en ligne`,
    html: renderEmailLayout({
      preheader: 'Votre événement a été validé et la billetterie est ouverte.',
      kicker: 'Billetterie',
      contentRows,
    }),
    text: `Votre événement ${evenementNom} a été validé par l'équipe Marché241 et est en ligne : ${evenementUrl}`,
  };
}

export interface VendeurEvenementRefuseData {
  evenementNom: string;
  motif: string;
  dashboardUrl: string;
}

export function vendeurEvenementRefuseTemplate({
  evenementNom,
  motif,
  dashboardUrl,
}: VendeurEvenementRefuseData): { subject: string; html: string; text: string } {
  const nom = echapperHtml(evenementNom);
  const contentRows = [
    badge({ label: 'Publication refusée', background: '#fef3c7', color: '#92400e' }),
    spacer(20),
    heading('Votre événement doit être complété'),
    spacer(20),
    paragraph(
      `L’équipe Marché241 n’a pas pu publier <strong style="color:#111827">${nom}</strong> pour le moment. Il est repassé en brouillon.`
    ),
    spacer(20),
    infoTable([
      { label: 'Événement', value: nom },
      { label: 'Motif', value: echapperHtml(motif) },
    ]),
    spacer(20),
    ctaButton(dashboardUrl, 'Modifier mon événement'),
    spacer(20),
    note('Une fois les corrections faites, cliquez de nouveau sur « Demander la publication ».'),
  ].join('\n');

  return {
    subject: `Votre événement « ${evenementNom} » n’a pas été publié`,
    html: renderEmailLayout({
      preheader: 'Votre événement doit être complété avant sa mise en ligne.',
      kicker: 'Billetterie',
      contentRows,
    }),
    text: `Votre événement ${evenementNom} n'a pas été publié. Motif : ${motif}. Modifiez-le ici : ${dashboardUrl}`,
  };
}
