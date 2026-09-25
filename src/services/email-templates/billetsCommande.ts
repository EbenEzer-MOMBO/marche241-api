import { badge, ctaButton, heading, infoTable, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface BilletsCommandeData {
  clientNom: string;
  numeroCommande: string;
  evenementNom: string;
  nombreBillets: number;
  billetsUrl: string;
}

export function billetsCommandeTemplate({
  clientNom,
  numeroCommande,
  evenementNom,
  nombreBillets,
  billetsUrl,
}: BilletsCommandeData): { subject: string; html: string; text: string } {
  const contentRows = [
    badge({ label: 'Billets', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading('Vos billets sont prêts'),
    spacer(20),
    paragraph(
      `Bonjour <strong style="color:#111827">${clientNom}</strong>, le paiement de la commande <strong style="color:#111827">${numeroCommande}</strong> est confirmé.`
    ),
    spacer(20),
    infoTable([
      { label: 'Événement', value: evenementNom },
      { label: 'Billets', value: String(nombreBillets) },
      { label: 'Commande', value: numeroCommande },
    ]),
    spacer(20),
    ctaButton(billetsUrl, nombreBillets > 1 ? 'Voir mes billets' : 'Voir mon billet'),
    spacer(20),
    note('Chaque billet porte un numéro unique. Présentez-les à l’entrée. Aucun nom n’est imprimé.'),
  ].join('\n');

  return {
    subject: `Vos billets — ${evenementNom}`,
    html: renderEmailLayout({
      preheader: `Téléchargez vos billets pour ${evenementNom}.`,
      kicker: 'Billetterie',
      contentRows,
    }),
    text: `Vos billets pour ${evenementNom} (commande ${numeroCommande}) : ${billetsUrl}`,
  };
}
