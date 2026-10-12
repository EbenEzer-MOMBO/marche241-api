import { badge, ctaButton, heading, infoTable, InfoRow, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurRelanceBoostsData {
  paragraphes: string[];
  lignes: InfoRow[];
  ctaUrl: string;
  lienDesinscription: string;
}

export function vendeurRelanceBoostsTemplate({
  paragraphes,
  lignes,
  ctaUrl,
  lienDesinscription
}: VendeurRelanceBoostsData): { html: string; text: string } {
  const blocs = paragraphes.map((html, index) => `${index > 0 ? spacer(16) : ''}${paragraph(html)}`).join('\n');
  const contentRows = [
    badge({ label: 'Boosts', background: '#eef6e8', color: '#3f7a1d' }),
    spacer(20),
    heading('Vos boosts vous attendent'),
    spacer(20),
    blocs,
    spacer(20),
    infoTable(lignes),
    spacer(20),
    ctaButton(ctaUrl, 'Finaliser mes boosts')
  ].join('\n');

  return {
    html: renderEmailLayout({
      preheader: 'Finalisez vos boosts pour mettre vos produits devant des milliers d’acheteurs au Gabon.',
      kicker: 'Boosts',
      contentRows,
      lienDesinscription
    }),
    text: `${paragraphes.map((p) => p.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')).join('\n\n')}\n\nFinaliser mes boosts : ${ctaUrl}\nNe plus recevoir ces rappels : ${lienDesinscription}`
  };
}
