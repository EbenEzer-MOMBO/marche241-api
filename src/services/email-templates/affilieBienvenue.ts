import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface AffilieBienvenueData {
  nom: string;
  code: string;
  lienPrincipal: string;
  dashboardUrl: string;
}

export function affilieBienvenueTemplate({ nom, code, lienPrincipal, dashboardUrl }: AffilieBienvenueData): {
  subject: string;
  html: string;
  text: string;
} {
  const contentRows = [
    badge({ label: 'Compte affilié créé', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading(`Bienvenue chez les affiliés Marché241, ${nom}`),
    spacer(20),
    paragraph("Voici votre code affilié, valable chez tous les vendeurs de la marketplace :"),
    spacer(20),
    `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td bgcolor="#f3f5f2" style="background-color:#f3f5f2;border:1px solid #e5e7eb;border-radius:12px;padding:18px;font-family:'Courier New', Courier, monospace;font-size:22px;font-weight:bold;color:#111827;" align="center">${code}</td></tr></table></td></tr>`,
    spacer(20),
    paragraph(`Votre lien principal à partager : <strong>${lienPrincipal}</strong>`),
    spacer(20),
    ctaButton(dashboardUrl, 'Accéder à mon tableau de bord'),
    spacer(20),
    infoTable([
      { label: '1 · Partagez votre lien', value: 'WhatsApp, réseaux sociaux, bio' },
      { label: '2 · Suivi en temps réel', value: 'commissions et versements dans le dashboard' },
      { label: '3 · Commission à la livraison', value: 'sur chaque commande confirmée avec votre code' },
    ]),
    spacer(20),
    note("Une question ? Répondez simplement à cet email, une personne de l'équipe vous lit."),
  ].join('\n');

  return {
    subject: 'Bienvenue chez les affiliés Marché241 — votre code est prêt',
    html: renderEmailLayout({
      preheader: `Votre code affilié ${code} est prêt à être partagé.`,
      kicker: 'Bienvenue',
      contentRows,
      unsubscribe: true,
    }),
    text: `Bienvenue chez les affiliés Marché241, ${nom} ! Votre code : ${code}. Lien à partager : ${lienPrincipal}. Tableau de bord : ${dashboardUrl}`,
  };
}
