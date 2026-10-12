/**
 * Filtre automatique des commentaires d'avis.
 * Un avis « suspect » n'est jamais approuvé automatiquement : il reste en file de modération
 * avec ses motifs visibles par l'équipe.
 */

export type MotifAvisSuspect = 'lien' | 'telephone' | 'email' | 'mot_interdit' | 'majuscules' | 'repetition';

export interface ResultatFiltreAvis {
  suspect: boolean;
  motifs: MotifAvisSuspect[];
}

const RE_LIEN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ga|fr|io|co|me|info|biz|xyz|shop|store|link|ly)\b)/i;
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Numéros gabonais (+241…, 0X XX XX XX) et toute suite de 8 chiffres ou plus (espaces / points / tirets tolérés)
const RE_TELEPHONE = /(\+?\s*241[\s.-]?\d)|(\b0[1-9](?:[\s.-]?\d){6,8}\b)|(\d(?:[\s.-]?\d){7,})/;

/** Minuscules sans accents, pour comparer les mots interdits. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function echapperRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function filtrerCommentaireAvis(commentaire: string | null | undefined, motsInterdits: string[] = []): ResultatFiltreAvis {
  const motifs: MotifAvisSuspect[] = [];
  const texte = (commentaire ?? '').trim();
  if (!texte) return { suspect: false, motifs };

  if (RE_LIEN.test(texte)) motifs.push('lien');
  if (RE_EMAIL.test(texte)) motifs.push('email');
  if (RE_TELEPHONE.test(texte)) motifs.push('telephone');

  const normalise = normaliser(texte);
  const mots = motsInterdits.map((m) => normaliser(m.trim())).filter(Boolean);
  if (mots.some((mot) => new RegExp(`(^|[^a-z0-9])${echapperRegex(mot)}([^a-z0-9]|$)`).test(normalise))) {
    motifs.push('mot_interdit');
  }

  const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (lettres.length >= 20 && lettres.replace(/[^A-ZÀ-Þ]/g, '').length / lettres.length > 0.7) motifs.push('majuscules');
  if (/(.)\1{9,}/.test(texte)) motifs.push('repetition');

  return { suspect: motifs.length > 0, motifs };
}

/**
 * Nettoie un texte saisi : supprime les caractères de contrôle et invisibles (sauf saut de ligne),
 * les balises HTML, réduit les sauts de ligne multiples. Renvoie null si vide.
 */
export function nettoyerTexteAvis(texte: string | null | undefined): string | null {
  if (texte == null) return null;
  const propre = String(texte)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return propre.length > 0 ? propre : null;
}
