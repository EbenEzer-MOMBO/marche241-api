import { badge, codeBlock, heading, note, paragraph, renderEmailLayout, spacer } from './layout';

export interface AffilieCodeConnexionData {
  code: string;
}

export function affilieCodeConnexionTemplate({ code }: AffilieCodeConnexionData): {
  subject: string;
  html: string;
  text: string;
} {
  const spacedCode = code.split('').join(' ');
  const contentRows = [
    badge({ label: 'Code de connexion', background: '#eef6e9', color: '#508e27' }),
    spacer(20),
    heading('Votre code de connexion affilié'),
    spacer(20),
    paragraph('Saisissez ce code pour accéder à votre tableau de bord affilié.'),
    spacer(20),
    codeBlock(code),
    spacer(20),
    paragraph('Ce code expire dans 10 minutes.'),
    spacer(20),
    note(
      `Si vous n'êtes pas à l'origine de cette demande, ne partagez ce code avec personne et <a href="mailto:support@marche241.ga" style="color:#508e27;text-decoration:underline;">contactez le support</a>.`
    ),
  ].join('\n');

  return {
    subject: 'Code de connexion affilié : ' + code,
    html: renderEmailLayout({
      preheader: `Code de connexion : ${spacedCode} — valable 10 minutes.`,
      kicker: 'Connexion affilié',
      contentRows,
    }),
    text: `Votre code de connexion affilié Marché241 est : ${code}. Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ne le partagez pas et contactez support@marche241.ga.`,
  };
}
