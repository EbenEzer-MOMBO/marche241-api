import { badge, ctaButton, heading, infoTable, InfoRow, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurAvisVersementData {
  montantFormate: string;
  moyenLabel: string;
  telephone: string;
  periodeLabel: string;
  reference: string;
  nombreCommandes?: number;
  boutiques?: string;
  paiementsUrl: string;
}

export function vendeurAvisVersementTemplate({
  montantFormate,
  moyenLabel,
  telephone,
  periodeLabel,
  reference,
  nombreCommandes,
  boutiques,
  paiementsUrl,
}: VendeurAvisVersementData): {
  subject: string;
  html: string;
  text: string;
} {
  const lignes: InfoRow[] = [
    { label: 'Période', value: periodeLabel },
    ...(nombreCommandes !== undefined ? [{ label: 'Commandes réglées', value: String(nombreCommandes) }] : []),
    ...(boutiques ? [{ label: 'Boutiques', value: boutiques }] : []),
    { label: 'Montant versé', value: `${montantFormate} FCFA` },
    { label: 'Référence', value: reference },
  ];

  const contentRows = [
    badge({ label: 'Versement envoyé', background: '#eef6e8', color: '#3f7a1d' }),
    spacer(20),
    heading(`${montantFormate} FCFA envoyés`),
    spacer(20),
    paragraph(
      `Votre versement a été transmis sur votre compte <strong style="color:#111827">${moyenLabel} · ${telephone}</strong>. La réception est généralement immédiate.`
    ),
    spacer(20),
    infoTable(lignes),
    spacer(20),
    ctaButton(paiementsUrl, 'Voir le détail des commandes'),
    spacer(20),
    note(
      `Montant non reçu sous 24 heures ? Envoyez-nous la référence <span style="font-family:'Courier New', Courier, monospace">${reference}</span> à <a href="mailto:support@marche241.ga" style="color:#508e27;text-decoration:underline;">support@marche241.ga</a>.`
    ),
  ].join('\n');

  return {
    subject: `Versement envoyé — ${montantFormate} FCFA`,
    html: renderEmailLayout({
      preheader: `Votre versement de ${montantFormate} FCFA a été envoyé sur ${moyenLabel}.`,
      kicker: 'Versement',
      contentRows,
    }),
    text: `Votre versement de ${montantFormate} FCFA pour la période ${periodeLabel} a été envoyé sur votre compte ${moyenLabel} (${telephone}). Référence : ${reference}. Montant non reçu sous 24 heures ? Écrivez à support@marche241.ga en indiquant la référence. Détail : ${paiementsUrl}`,
  };
}
