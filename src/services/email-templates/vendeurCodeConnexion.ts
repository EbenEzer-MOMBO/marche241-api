import { badge, codeBlock, heading, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface VendeurCodeConnexionData {
  code: string;
  contexte?: string;
}

export function vendeurCodeConnexionTemplate({ code, contexte }: VendeurCodeConnexionData): { subject: string; html: string; text: string } {
  const spacedCode = code.split('').join(' ');
  const contentRows = [
    badge({ label: 'Code de connexion', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading('Votre code de connexion'),
    spacer(20),
    paragraph('Saisissez ce code pour accéder à votre tableau de bord vendeur.'),
    spacer(20),
    codeBlock(code),
    spacer(20),
    paragraph(contexte || 'Ce code expire dans 10 minutes.'),
    spacer(20),
    note(
      `Code non reçu ? <a href="https://marche241.ga/connexion" style="color:#508e27;text-decoration:underline;">Renvoyer un nouveau code</a> — le code précédent sera alors désactivé.`
    ),
    spacer(20),
    note(
      `Si vous n'êtes pas à l'origine de cette demande, ne partagez ce code avec personne et <a href="mailto:support@marche241.ga" style="color:#508e27;text-decoration:underline;">contactez le support</a>.`
    ),
  ].join('\n');

  return {
    subject: 'Code de connexion : ' + code,
    html: renderEmailLayout({
      preheader: `Code de connexion : ${spacedCode} — valable 10 minutes.`,
      kicker: 'Connexion vendeur',
      contentRows,
    }),
    text: `Votre code de connexion Marché241 est : ${code}. Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ne le partagez pas et contactez support@marche241.ga.`,
  };
}
