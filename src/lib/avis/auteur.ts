/**
 * Nom public de l'auteur d'un avis : « Prénom N. ».
 * Le nom complet, le téléphone et l'e-mail ne sont jamais exposés hors back-office.
 */
export function nomAuteurAvis(nomClient: string | null | undefined): string {
  const morceaux = (nomClient ?? '')
    .replace(/[^\p{L}\p{M}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (morceaux.length === 0) return 'Client';
  const majuscule = (mot: string) => mot.charAt(0).toLocaleUpperCase('fr') + mot.slice(1).toLocaleLowerCase('fr');
  const prenom = majuscule(morceaux[0]);
  if (morceaux.length === 1) return prenom;
  return `${prenom} ${morceaux[morceaux.length - 1].charAt(0).toLocaleUpperCase('fr')}.`;
}

/** Prénom seul (message d'invitation, en-tête de la page /avis/[jeton]). */
export function prenomClient(nomClient: string | null | undefined): string {
  return nomAuteurAvis(nomClient).split(' ')[0];
}
