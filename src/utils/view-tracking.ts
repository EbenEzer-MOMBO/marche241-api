import { Request } from 'express';

const PREVIEW_HEADER = 'x-boutique-preview';
const SKIP_TRACKING_HEADER = 'x-skip-view-tracking';

/**
 * Normalise une IP (IPv6 mappée IPv4, zones, espaces) pour le lookup géo
 * et les règles d'exclusion localhost.
 */
export function normaliserIp(ip: string): string {
  const brute = (ip || '').trim();
  if (!brute) {
    return 'unknown';
  }

  const sansZone = brute.split('%')[0];
  if (sansZone.startsWith('::ffff:')) {
    return sansZone.slice('::ffff:'.length);
  }

  return sansZone;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return normaliserIp(ips[0]);
  }

  return normaliserIp(req.socket?.remoteAddress || req.ip || 'unknown');
}

export function estIpPriveeOuLocale(ip: string): boolean {
  const normalisee = normaliserIp(ip).toLowerCase();

  if (
    normalisee === 'unknown' ||
    normalisee === '127.0.0.1' ||
    normalisee === '::1' ||
    normalisee === 'localhost' ||
    normalisee === '0.0.0.0'
  ) {
    return true;
  }

  if (normalisee.startsWith('10.')) {
    return true;
  }

  if (normalisee.startsWith('192.168.')) {
    return true;
  }

  if (normalisee.startsWith('169.254.')) {
    return true;
  }

  const match172 = /^172\.(\d+)\./.exec(normalisee);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  if (normalisee.startsWith('fc') || normalisee.startsWith('fd') || normalisee.startsWith('fe80:')) {
    return true;
  }

  return false;
}

function headerEstActif(req: Request, nom: string): boolean {
  const valeur = req.headers[nom];
  if (Array.isArray(valeur)) {
    return valeur[0] === '1';
  }

  return valeur === '1';
}

export function estRequetePreview(req: Request): boolean {
  return req.query.preview === '1' || headerEstActif(req, PREVIEW_HEADER);
}

export function estRequeteSansTracking(req: Request): boolean {
  return req.query.track === '0' || headerEstActif(req, SKIP_TRACKING_HEADER);
}

/**
 * Une visite ne doit pas être comptée si c'est une prévisualisation, un fetch
 * interne (layout/métadonnées), un admin plateforme, le vendeur propriétaire,
 * ou une IP locale/privée (dev, SSR localhost).
 */
export function doitEnregistrerLaVue(req: Request, proprietaireVendeurId?: number): boolean {
  if (estRequeteSansTracking(req) || estRequetePreview(req)) {
    return false;
  }

  if (req.isAdmin) {
    return false;
  }

  if (proprietaireVendeurId && req.vendeur && req.vendeur.id === proprietaireVendeurId) {
    return false;
  }

  if (estIpPriveeOuLocale(getClientIp(req))) {
    return false;
  }

  return true;
}
