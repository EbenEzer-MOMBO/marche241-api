import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoostEnLigneData {
  vendeurNom: string;
  boutiqueNom: string;
  titrePub: string;
  objectif: string;
  budget: string;
  dateDebut: string;
  dateFin: string;
  lienSuivi: string;
}

const echapper = (valeur: string) =>
  valeur.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** E-mail envoyé au vendeur quand Meta a accepté sa publicité et qu'elle est diffusée. */
export function vendeurBoostEnLigneTemplate(data: VendeurBoostEnLigneData): { subject: string; html: string; text: string } {
  const e = {
    vendeur: echapper(data.vendeurNom),
    boutique: echapper(data.boutiqueNom),
    titre: echapper(data.titrePub),
    objectif: echapper(data.objectif),
    budget: echapper(data.budget),
    debut: echapper(data.dateDebut),
    fin: echapper(data.dateFin)
  };
  const contentRows = [
    badge({ label: 'Publicité en ligne', background: '#dcfce7', color: '#15803d' }),
    spacer(20),
    heading('Votre publicité est en ligne 🚀'),
    spacer(20),
    paragraph(
      `Bonjour ${e.vendeur}, Meta a accepté la publicité de <strong style="color:#111827">${e.boutique}</strong>. Elle est maintenant diffusée sur Facebook et Instagram.`
    ),
    spacer(20),
    infoTable([
      { label: 'Publicité', value: e.titre },
      { label: 'Objectif', value: e.objectif },
      { label: 'Budget publicitaire', value: e.budget },
      { label: 'Diffusion', value: `du ${e.debut} au ${e.fin}` }
    ]),
    spacer(20),
    ctaButton(data.lienSuivi, 'Suivre ma publicité'),
    spacer(20),
    note('Vues, personnes touchées, clics et budget dépensé sont mis à jour toutes les heures dans votre espace vendeur, rubrique Publicité.')
  ].join('\n');

  return {
    subject: `Votre publicité « ${data.titrePub} » est en ligne`,
    html: renderEmailLayout({
      preheader: 'Meta a accepté votre publicité : elle est diffusée sur Facebook et Instagram.',
      kicker: 'Publicité Facebook & Instagram',
      contentRows
    }),
    text: `Bonjour ${data.vendeurNom}, Meta a accepté la publicité « ${data.titrePub} » de ${data.boutiqueNom}. Elle est diffusée sur Facebook et Instagram du ${data.dateDebut} au ${data.dateFin} (budget ${data.budget}). Suivez ses résultats ici : ${data.lienSuivi}`
  };
}
