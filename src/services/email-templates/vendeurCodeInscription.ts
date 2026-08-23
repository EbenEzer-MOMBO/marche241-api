import { badge, codeBlock, heading, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurCodeInscriptionData {
  nom?: string;
  code: string;
}

export function vendeurCodeInscriptionTemplate({ nom, code }: VendeurCodeInscriptionData): { subject: string; html: string; text: string } {
  const spacedCode = code.split('').join(' ');
  const contentRows = [
    badge({ label: "Code d'inscription", background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading('Confirmez votre numéro pour ouvrir votre boutique'),
    spacer(20),
    paragraph(`Bonjour ${nom || ''}, entrez ce code dans l'écran d'inscription pour créer votre boutique sur Marché241.`),
    spacer(20),
    codeBlock(code),
    spacer(20),
    paragraph(`Ce code expire dans <strong style="color:#111827">10 minutes</strong>. Il ne fonctionne qu'une seule fois.`),
    spacer(20),
    note("Vous n'avez pas demandé ce code ? Ignorez cet email — aucun compte ne sera créé."),
  ].join('\n');

  return {
    subject: "Votre code d'inscription : " + code,
    html: renderEmailLayout({
      preheader: `Votre code de vérification : ${spacedCode} — valable 10 minutes.`,
      kicker: 'Inscription vendeur',
      contentRows,
    }),
    text: `Votre code d'inscription Marché241 est : ${code}. Ce code expire dans 10 minutes et ne fonctionne qu'une seule fois. Si vous n'avez pas demandé ce code, ignorez cet email.`,
  };
}
