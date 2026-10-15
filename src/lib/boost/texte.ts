/**
 * Texte publié sur Meta : le lien vers la boutique Marché 241 est ajouté en fin de texte si le vendeur
 * ne l'a pas déjà mis. Il reste ainsi joignable depuis la pub quel que soit l'objectif (une pub WhatsApp
 * ouvre la conversation de la Page qui diffuse, pas celle du vendeur).
 */

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vrai si le texte contient déjà un lien vers cette boutique (avec ou sans https://, page produit comprise). */
export function contientLienBoutique(texte: string, lienBoutique: string): boolean {
  let hote: string;
  let chemin: string;
  try {
    const url = new URL(lienBoutique);
    hote = url.hostname.replace(/^www\./, '');
    chemin = url.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
  // Sans chemin (slug vide), toute mention du site compterait : on exige le chemin de la boutique
  if (!chemin) return false;
  // « marche241.ga/kalia » suivi d'une fin, d'un « / », « ? », « # » ou d'un espace (pas « kalia2 »)
  const motif = new RegExp(`(?:www\\.)?${echapper(hote)}${echapper(chemin)}(?![A-Za-z0-9_-])`, 'i');
  return motif.test(texte);
}

/**
 * Lien public de la boutique : même origine que le lien de destination du boost s'il pointe vers
 * Marché 241, sinon le site officiel. Jamais FRONTEND_URL, propre à l'environnement (localhost…).
 */
export function lienBoutiquePublic(slug: string, urlDestination: string | null | undefined): string {
  let origine = 'https://marche241.ga';
  try {
    const url = new URL(urlDestination ?? '');
    const hote = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && (hote === 'marche241.ga' || hote.endsWith('.marche241.ga'))) origine = url.origin;
  } catch {
    // lien absent ou invalide : site officiel
  }
  return `${origine}/${slug}`;
}

export function ajouterLienBoutique(texte: string, lienBoutique: string): string {
  if (contientLienBoutique(texte, lienBoutique)) return texte;
  const base = texte.trimEnd();
  const ligne = `🛍️ Boutique : ${lienBoutique}`;
  return base ? `${base}\n\n${ligne}` : ligne;
}
