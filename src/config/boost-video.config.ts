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

/** URL sous STORAGE_PUBLIC_URL (sans importer config/storage, qui exige les secrets). */
export function estUrlStockagePublic(url: string): boolean {
  const base = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!base) return true;
  return url === base || url.startsWith(`${base}/`);
}

/** Vidéo dans le dossier `boosts/{slug}/` de la boutique. */
export function estUrlVideoBoutique(url: string, slug: string): boolean {
  if (!estUrlStockagePublic(url)) return false;
  try {
    const chemin = new URL(url).pathname;
    return chemin.includes(`/boosts/${slug}/`);
  } catch {
    return false;
  }
}

export function extensionVideo(contentType: string): '.mp4' | '.mov' {
  return contentType === 'video/quicktime' ? '.mov' : '.mp4';
}
