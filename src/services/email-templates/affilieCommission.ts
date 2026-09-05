import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface AffilieCommissionData {
  nom: string;
  numeroCommande: string;
  montantCommission: number;
  dashboardUrl: string;
}

export function affilieCommissionTemplate({
  nom,
  numeroCommande,
  montantCommission,
  dashboardUrl,
}: AffilieCommissionData): { subject: string; html: string; text: string } {
  const contentRows = [
    badge({ label: 'Nouvelle commission', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading(`Une commande livrée avec votre code, ${nom} !`),
    spacer(20),
    paragraph(`La commande <strong>#${numeroCommande}</strong>, passée avec votre code affilié, vient d'être livrée.`),
    spacer(20),
    infoTable([
      { label: 'Commande', value: `#${numeroCommande}` },
      { label: 'Commission créditée', value: `${montantCommission} FCFA` },
    ]),
    spacer(20),
    ctaButton(dashboardUrl, 'Voir mes commissions'),
    spacer(20),
    note("Cette commission sera versée lors du prochain règlement des affiliés."),
  ].join('\n');

  return {
    subject: `Nouvelle commission — commande #${numeroCommande} livrée`,
    html: renderEmailLayout({
      preheader: `Commission de ${montantCommission} FCFA créditée sur la commande #${numeroCommande}.`,
      kicker: 'Commission',
      contentRows,
      unsubscribe: true,
    }),
    text: `La commande #${numeroCommande} passée avec votre code affilié a été livrée. Commission créditée : ${montantCommission} FCFA. Tableau de bord : ${dashboardUrl}`,
  };
}
