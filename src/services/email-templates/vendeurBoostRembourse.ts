import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurBoostRembourseData {
  vendeurNom: string;
  boutiqueNom: string;
  titrePub: string;
  montant: string;
  motif: string;
  /** Détail du calcul, montants déjà formatés (négatifs pour les retenues). */
  lignes: { libelle: string; montant: string }[];
  /**
   * Transfert mobile money effectué par Marché 241. Absent si le remboursement a été fait hors
   * application : sa date réelle est alors inconnue et n'est pas affichée.
   */
  transfert?: { moyen: string; telephone: string; reference: string; date: string } | null;
  lienSuivi: string;
}

const echapper = (valeur: string) =>
  valeur.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** E-mail envoyé au vendeur quand l'équipe a remboursé (tout ou partie) le montant payé pour un boost. */
export function vendeurBoostRembourseTemplate(data: VendeurBoostRembourseData): { subject: string; html: string; text: string } {
  const montant = echapper(data.montant);
  const transfert = data.transfert;
  const contentRows = [
    badge({ label: 'Remboursement effectué', background: '#dbeafe', color: '#1d4ed8' }),
    spacer(20),
    heading(`${montant} vous ont été remboursés`),
    spacer(20),
    paragraph(
      `Bonjour ${echapper(data.vendeurNom)}, nous avons remboursé ${montant} pour la publicité « <strong style="color:#111827">${echapper(data.titrePub)}</strong> » de ${echapper(data.boutiqueNom)}.`
    ),
    spacer(12),
    paragraph(echapper(data.motif)),
    spacer(20),
    infoTable([
      ...data.lignes.map((l) => ({ label: echapper(l.libelle), value: echapper(l.montant) })),
      { label: '<strong>Montant remboursé</strong>', value: montant }
    ]),
    spacer(20),
    infoTable(
      transfert
        ? [
            { label: 'Versé sur', value: `${echapper(transfert.moyen)} · ${echapper(transfert.telephone)}` },
            { label: 'Référence', value: echapper(transfert.reference) },
            { label: 'Date', value: echapper(transfert.date) }
          ]
        : [{ label: 'Versement', value: 'Effectué par l’équipe Marché 241' }]
    ),
    spacer(20),
    ctaButton(data.lienSuivi, 'Voir ma publicité'),
    spacer(20),
    note(
      "Les frais d'encaissement du paiement mobile money ou carte sont prélevés par l'opérateur de paiement et ne peuvent pas être remboursés. Une question ? Répondez simplement à cet e-mail."
    )
  ].join('\n');

  const detail = data.lignes.map((l) => `- ${l.libelle} : ${l.montant}`).join('\n');
  const versement = transfert
    ? `Versé sur ${transfert.moyen} (${transfert.telephone}), référence ${transfert.reference}, le ${transfert.date}.`
    : `Versement effectué par l'équipe Marché 241.`;

  return {
    subject: `Remboursement de ${data.montant} pour votre publicité « ${data.titrePub} »`,
    html: renderEmailLayout({
      preheader: `${data.montant} vous ont été remboursés pour votre publicité.`,
      kicker: 'Publicité Facebook & Instagram',
      contentRows
    }),
    text: `Bonjour ${data.vendeurNom}, nous avons remboursé ${data.montant} pour la publicité « ${data.titrePub} » de ${data.boutiqueNom}.\n\n${data.motif}\n\n${detail}\nMontant remboursé : ${data.montant}\n\n${versement}\n\nVoir ma publicité : ${data.lienSuivi}`
  };
}
