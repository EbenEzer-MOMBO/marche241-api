/**
 * Villes proposées à la création d'une boutique.
 * Reprend les noms de VILLES_GABON (ciblage boost) et ajoute les communes
 * du Grand Libreville. Le ciblage Meta n'utilise pas cette liste.
 */
export const VILLES_BOUTIQUE = [
  'Libreville',
  'Akanda',
  'Owendo',
  'Ntoum',
  'Port-Gentil',
  'Franceville',
  'Oyem',
  'Moanda',
  'Lambaréné',
  'Tchibanga',
  'Makokou',
  'Mouila',
  'Bitam',
  'Koulamoutou',
  'Retrait en magasin',
  'Province'
] as const;

const ACCENTS = 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ';
const SANS_ACCENTS = 'aaaaaaeeeeiiiiooooouuuuyycn';

function retirerAccents(valeur: string): string {
  return valeur
    .split('')
    .map((caractere) => {
      const index = ACCENTS.indexOf(caractere);
      return index === -1 ? caractere : SANS_ACCENTS[index];
    })
    .join('');
}

function cleVille(valeur: string): string {
  return retirerAccents(valeur.trim().toLowerCase())
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONIQUES: Record<string, string> = {
  libreville: 'Libreville',
  'grand libreville': 'Libreville',
  'libreville centre': 'Libreville',
  'gabon libreville': 'Libreville',
  akanda: 'Akanda',
  owendo: 'Owendo',
  ntoum: 'Ntoum',
  'port gentil': 'Port-Gentil',
  portgentil: 'Port-Gentil',
  franceville: 'Franceville',
  oyem: 'Oyem',
  moanda: 'Moanda',
  lambarene: 'Lambaréné',
  tchibanga: 'Tchibanga',
  makokou: 'Makokou',
  mouila: 'Mouila',
  bitam: 'Bitam',
  koulamoutou: 'Koulamoutou',
  'retrait en magasin': 'Retrait en magasin',
  province: 'Province'
};

/**
 * Équivalent TypeScript de normaliser_ville(). Une valeur inconnue est
 * renvoyée nettoyée (espaces), jamais remplacée par « Autre ».
 */
export function normaliserVille(ville: string | null | undefined): string | null | undefined {
  if (ville == null) {
    return ville;
  }

  const nettoyee = ville.trim().replace(/\s+/g, ' ');
  if (!nettoyee) {
    return '';
  }

  return CANONIQUES[cleVille(nettoyee)] ?? nettoyee;
}
