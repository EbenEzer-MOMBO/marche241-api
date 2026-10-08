import { Request } from 'express';
import { paysDepuisFuseau, paysPossiblesDuFuseau } from '../config/fuseaux-pays.config';
import { CODE_PAYS_VPN } from './ip-proxy';

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

const ROBOT =
  /bot|crawl|spider|facebookexternalhit|whatsapp\/|slurp|lighthouse|headless/i;

export function estRobot(userAgent?: string): boolean {
  if (!userAgent || !userAgent.trim()) {
    return true;
  }

  const brut = userAgent.trim().toLowerCase();
  if (brut === 'node' || brut.startsWith('node/') || brut.startsWith('curl') || brut.startsWith('axios')) {
    return true;
  }

  return ROBOT.test(userAgent);
}

export function detecterAppareil(userAgent?: string): 'android' | 'ios' | 'desktop' | 'autre' {
  const ua = (userAgent || '').toLowerCase();
  if (/android/.test(ua)) {
    return 'android';
  }
  if (/iphone|ipad|ipod/.test(ua)) {
    return 'ios';
  }
  if (/windows|macintosh|mac os|linux|cros/.test(ua)) {
    return 'desktop';
  }
  return 'autre';
}

const SOURCES = ['whatsapp', 'facebook', 'instagram', 'tiktok', 'google', 'direct', 'interne', 'autre'] as const;

export type SourceVueDetectee = (typeof SOURCES)[number];

export function detecterSource(referrer?: string, utmSource?: string): SourceVueDetectee {
  const utm = (utmSource || '').trim().toLowerCase();
  if (utm) {
    const connue = SOURCES.find((source) => source === utm);
    return connue ?? 'autre';
  }

  const ref = (referrer || '').trim().toLowerCase();
  if (!ref) {
    return 'direct';
  }

  if (ref.includes('marche241')) {
    return 'interne';
  }
  if (ref.includes('whatsapp') || ref.includes('wa.me')) {
    return 'whatsapp';
  }
  if (ref.includes('facebook.') || ref.includes('fb.com') || ref.includes('fb.me')) {
    return 'facebook';
  }
  if (ref.includes('instagram.')) {
    return 'instagram';
  }
  if (ref.includes('tiktok.')) {
    return 'tiktok';
  }
  if (ref.includes('google.')) {
    return 'google';
  }

  return 'autre';
}

export interface LocalisationVue {
  pays: string | null;
  ville: string | null;
  pays_ip: string | null;
  via_vpn: boolean | null;
}

/**
 * Le pays vient du fuseau du navigateur (non modifié par un VPN), à défaut de
 * l'IP. Un écart entre les deux signale un VPN : la ville de l'IP, celle du
 * serveur VPN, est alors écartée.
 */
export function resoudreLocalisation(
  geoIp: { pays: string | null; ville: string | null },
  fuseau?: string | null
): LocalisationVue {
  const ipEstProxy = geoIp.pays === CODE_PAYS_VPN;

  // Fuseau partagé (ex. Africa/Lagos) : il confirme ou infirme le pays de l'IP
  const paysPossibles = paysPossiblesDuFuseau(fuseau);
  if (paysPossibles) {
    if (!geoIp.pays) {
      return { pays: null, ville: null, pays_ip: null, via_vpn: null };
    }
    const coherent = !ipEstProxy && paysPossibles.includes(geoIp.pays);
    return {
      pays: coherent ? geoIp.pays : null,
      ville: coherent ? geoIp.ville : null,
      pays_ip: geoIp.pays,
      via_vpn: !coherent
    };
  }

  const paysFuseau = paysDepuisFuseau(fuseau);

  let viaVpn: boolean | null;
  if (ipEstProxy) {
    viaVpn = true;
  } else if (paysFuseau && geoIp.pays) {
    viaVpn = geoIp.pays !== paysFuseau;
  } else if (!paysFuseau && !geoIp.pays) {
    viaVpn = null;
  } else {
    viaVpn = false;
  }

  return {
    pays: paysFuseau ?? (ipEstProxy ? null : geoIp.pays),
    ville: viaVpn ? null : geoIp.ville,
    pays_ip: geoIp.pays,
    via_vpn: viaVpn
  };
}

/**
 * Une visite ne doit pas être comptée si c'est une prévisualisation, un fetch
 * interne (layout/métadonnées), un robot, un admin plateforme, le vendeur
 * propriétaire, ou une IP locale/privée (dev, SSR localhost).
 */
export function doitEnregistrerLaVue(req: Request, proprietaireVendeurId?: number): boolean {
  if (estRequeteSansTracking(req) || estRequetePreview(req) || estRobot(req.headers['user-agent'])) {
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
