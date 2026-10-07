/**
 * Lien de destination d'une bannière.
 * - Vendeur : construit par l'API depuis FRONTEND_URL et le slug de SA boutique (ou d'un de ses produits) ;
 *   jamais saisi librement, pour ne pas envoyer les acheteurs hors de la plateforme.
 * - Externe : URL https libre, validée par l'équipe.
 */

const nettoyerBase = (base: string): string => base.replace(/\/+$/, '');

export function urlBoutique(frontendUrl: string, slugBoutique: string): string {
  return `${nettoyerBase(frontendUrl)}/${encodeURIComponent(slugBoutique)}`;
}

/** Page produit d'une vitrine : /<boutique>/produit/<id> (route du front). */
export function urlProduit(frontendUrl: string, slugBoutique: string, produitId: number): string {
  return `${urlBoutique(frontendUrl, slugBoutique)}/produit/${produitId}`;
}

/** Renvoie un message d'erreur si l'URL d'un annonceur externe n'est pas acceptable, sinon null. */
export function erreurUrlExterne(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return 'Le lien de destination est obligatoire';
  let parsee: URL;
  try {
    parsee = new URL(url.trim());
  } catch {
    return 'Le lien de destination doit être une adresse web valide';
  }
  if (parsee.protocol !== 'https:') return 'Le lien de destination doit commencer par https://';
  if (parsee.username || parsee.password) return 'Le lien de destination ne doit pas contenir d\'identifiants';
  return null;
}

/** Paramètres UTM ajoutés aux liens vers Marché 241 (mesure dans Google Analytics). */
export function ajouterUtmPublicite(url: string, publiciteId: number, frontendUrl: string): string {
  try {
    const parsee = new URL(url);
    if (parsee.origin !== new URL(frontendUrl).origin) return url;
    parsee.searchParams.set('utm_source', 'marche241');
    parsee.searchParams.set('utm_medium', 'banniere');
    parsee.searchParams.set('utm_campaign', `pub_${publiciteId}`);
    return parsee.toString();
  } catch {
    return url;
  }
}
