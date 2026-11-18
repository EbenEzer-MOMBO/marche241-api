import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

const CHAINE_WHATSAPP_URL = 'https://whatsapp.com/channel/0029VbBzgLjAzNbrcnABaa3M';

export interface VendeurBienvenueData {
  nom: string;
  boutiqueUrl: string;
  dashboardProduitsUrl: string;
}

export function vendeurBienvenueTemplate({ nom, boutiqueUrl, dashboardProduitsUrl }: VendeurBienvenueData): { subject: string; html: string; text: string } {
  const contentRows = [
    badge({ label: 'Boutique créée', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading(`Votre boutique est en ligne, ${nom}`),
    spacer(20),
    paragraph("Votre lien public est actif dès maintenant. Partagez-le sur WhatsApp, Facebook ou dans votre bio Instagram."),
    spacer(20),
    `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td bgcolor="#f3f5f2" style="background-color:#f3f5f2;border:1px solid #e5e7eb;border-radius:12px;padding:18px;font-family:'Courier New', Courier, monospace;font-size:17px;font-weight:bold;color:#111827;" align="center">${boutiqueUrl}</td></tr></table></td></tr>`,
    spacer(20),
    ctaButton(dashboardProduitsUrl, 'Ajouter mes premiers produits'),
    spacer(20),
    infoTable([
      { label: '1 · Ajoutez 3 produits', value: 'photo, prix, stock' },
      { label: '2 · Activez les paiements', value: 'Airtel Money ou Moov Money' },
      { label: '3 · Partagez votre lien', value: 'WhatsApp et réseaux sociaux' },
    ]),
    spacer(20),
    paragraph('Rejoignez notre chaîne WhatsApp pour suivre les nouveautés, les conseils de vente et les annonces de la plateforme.'),
    spacer(20),
    ctaButton(CHAINE_WHATSAPP_URL, 'Rejoindre la chaîne WhatsApp'),
    spacer(20),
    note("Une question ? Répondez simplement à cet email, une personne de l'équipe vous lit."),
  ].join('\n');

  return {
    subject: 'Bienvenue sur Marché241 — votre boutique est en ligne',
    html: renderEmailLayout({
      preheader: 'Votre boutique est en ligne. Trois étapes pour votre première vente.',
      kicker: 'Bienvenue',
      contentRows,
      unsubscribe: true,
    }),
    text: `Bienvenue sur Marché241, ${nom} ! Votre boutique est en ligne : ${boutiqueUrl}. Ajoutez vos premiers produits ici : ${dashboardProduitsUrl}. Rejoignez notre chaîne WhatsApp : ${CHAINE_WHATSAPP_URL}`,
  };
}
