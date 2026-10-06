/** Attribution des visites issues d'un boost (port de boost_meta/src/lib/utm.ts). */

export const BOOST_UTM_SOURCE = 'facebook';
export const BOOST_UTM_MEDIUM = 'marche241_boost';

export function utmCampaign(boostId: number): string {
  return `boost_${boostId}`;
}

export function ajouterUtmBoost(urlBrute: string, boostId: number): string {
  const url = new URL(urlBrute);
  url.searchParams.set('utm_source', BOOST_UTM_SOURCE);
  url.searchParams.set('utm_medium', BOOST_UTM_MEDIUM);
  url.searchParams.set('utm_campaign', utmCampaign(boostId));
  return url.toString();
}

/** Vrai si l'URL pointe vers le front Marché 241 (même hôte que FRONTEND_URL ou *.marche241.ga). */
export function estDestinationMarche241(url: string | null | undefined, frontendUrl?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'marche241.ga' || host.endsWith('.marche241.ga')) return true;
    if (frontendUrl) return host === new URL(frontendUrl).hostname.toLowerCase();
    return false;
  } catch {
    return false;
  }
}
