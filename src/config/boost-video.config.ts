/**
 * Limites de la créa vidéo des boosts Meta (KOR-145).
 * Migrables plus tard vers boost_parametres.
 *
 * CORS R2 : le PUT présigné depuis le navigateur exige une règle CORS sur le bucket
 * (origines du front, méthodes PUT/HEAD, en-tête Content-Type). Sans elle l'upload direct échoue.
 */

export const TYPES_VIDEO_BOOST = ['video/mp4', 'video/quicktime'] as const;

export const TAILLE_MAX_VIDEO_BOOST = 50 * 1024 * 1024;

export const DUREE_MAX_VIDEO_BOOST_SEC = 60;

export const DUREE_MIN_VIDEO_BOOST_SEC = 1;

export const RATIOS_VIDEO_BOOST = ['4:5', '1:1', '9:16'] as const;

export const URL_PUT_VIDEO_EXPIRE_SEC = 600;

export const ATTENTE_VIDEO_META_MS = 40_000;

export type TypeVideoBoost = (typeof TYPES_VIDEO_BOOST)[number];

export function estTypeVideoAutorise(contentType: string): contentType is TypeVideoBoost {
  return (TYPES_VIDEO_BOOST as readonly string[]).includes(contentType);
}

export const DELAI_BROUILLON_VIDEO_JOURS = 7;

export const DELAI_VIDEO_BOOST_TERMINE_JOURS = 30;

function baseStockage(): URL | null {
  const brut = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!brut) return null;
  try {
    return new URL(brut);
  } catch {
    return null;
  }
}

/**
 * Chemin de l'objet dans le bucket (sans slash initial) si l'URL est servie par STORAGE_PUBLIC_URL
 * (même origine, même préfixe), sinon null. Échoue fermé : sans STORAGE_PUBLIC_URL, rien n'est accepté
 * (sans cette base, l'API ne démarre de toute façon pas, cf. config/storage).
 */
function cheminSousBase(url: string): string | null {
  const base = baseStockage();
  if (!base) return null;
  try {
    const u = new URL(url);
    if (u.origin !== base.origin) return null;
    const prefixe = `${base.pathname.replace(/\/+$/, '')}/`;
    if (!u.pathname.startsWith(prefixe)) return null;
    const chemin = decodeURIComponent(u.pathname.slice(prefixe.length));
    // Les clés générées par l'API ne contiennent ni '..', ni '//', ni '%' (un double encodage serait un contournement)
    return chemin === '' || chemin.includes('..') || chemin.includes('//') || chemin.includes('%') ? null : chemin;
  } catch {
    return null;
  }
}

/** URL servie par le stockage Marché 241 (STORAGE_PUBLIC_URL). */
export function estUrlStockagePublic(url: string): boolean {
  return cheminSousBase(url) !== null;
}

/** Vidéo MP4/MOV dans le dossier `boosts/{slug}/` de la boutique (préfixe exact, pas une simple inclusion). */
export function estUrlVideoBoutique(url: string, slug: string): boolean {
  const chemin = cheminSousBase(url);
  return chemin !== null && chemin.startsWith(`boosts/${slug}/`) && /\.(mp4|mov)$/i.test(chemin);
}

/**
 * Chemin R2 d'une vidéo de boost (`boosts/{slug}/fichier.mp4|mov`) à partir de son URL publique, ou null
 * si l'URL n'est pas une vidéo de boost : garde-fou pour ne jamais supprimer autre chose qu'une vidéo.
 */
export function cheminVideoDepuisUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const chemin = cheminSousBase(url);
  return chemin !== null && /^boosts\/[^/]+\/[^/]+\.(mp4|mov)$/i.test(chemin) ? chemin : null;
}

export function extensionVideo(contentType: string): '.mp4' | '.mov' {
  return contentType === 'video/quicktime' ? '.mov' : '.mp4';
}
