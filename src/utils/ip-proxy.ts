import { normaliserIp } from './view-tracking';

export const CODE_PAYS_VPN = 'VPN';

const CLOUDFLARE_CIDR_V4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
] as const;

const CLOUDFLARE_CIDR_V6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const;

function ipv4VersEntier(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }

  let valeur = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) {
      return null;
    }
    const nombre = Number(octet);
    if (nombre > 255) {
      return null;
    }
    valeur = (valeur << 8) + nombre;
  }

  return valeur >>> 0;
}

function cidrV4Contient(ip: string, cidr: string): boolean {
  const [base, bitsBruts] = cidr.split('/');
  const bits = Number(bitsBruts);
  const ipEntier = ipv4VersEntier(ip);
  const baseEntier = ipv4VersEntier(base);

  if (ipEntier === null || baseEntier === null || Number.isNaN(bits) || bits < 0 || bits > 32) {
    return false;
  }

  if (bits === 0) {
    return true;
  }

  const masque = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

  return (ipEntier & masque) === (baseEntier & masque);
}

function ipv6VersBigInt(ip: string): bigint | null {
  const sansZone = ip.split('%')[0].toLowerCase();
  if (!sansZone.includes(':')) {
    return null;
  }

  const [gaucheBrut, droiteBrut] = sansZone.split('::');
  const gauche = gaucheBrut ? gaucheBrut.split(':').filter(Boolean) : [];
  const droite = droiteBrut !== undefined
    ? (droiteBrut ? droiteBrut.split(':').filter(Boolean) : [])
    : [];

  if (droiteBrut === undefined && gauche.length !== 8) {
    return null;
  }

  const manquants = 8 - gauche.length - droite.length;
  if (droiteBrut !== undefined && manquants < 0) {
    return null;
  }

  const groupes = droiteBrut === undefined
    ? gauche
    : [...gauche, ...Array(manquants).fill('0'), ...droite];

  if (groupes.length !== 8) {
    return null;
  }

  let valeur = 0n;
  for (const groupe of groupes) {
    if (!/^[0-9a-f]{1,4}$/.test(groupe)) {
      return null;
    }
    valeur = (valeur << 16n) + BigInt(parseInt(groupe, 16));
  }

  return valeur;
}

function cidrV6Contient(ip: string, cidr: string): boolean {
  const [base, bitsBruts] = cidr.split('/');
  const bits = Number(bitsBruts);
  const ipValeur = ipv6VersBigInt(ip);
  const baseValeur = ipv6VersBigInt(base);

  if (ipValeur === null || baseValeur === null || Number.isNaN(bits) || bits < 0 || bits > 128) {
    return false;
  }

  if (bits === 0) {
    return true;
  }

  const decalage = 128n - BigInt(bits);
  const masque = ((1n << BigInt(bits)) - 1n) << decalage;

  return (ipValeur & masque) === (baseValeur & masque);
}

export function estIpProxyOuCdn(ipAddress: string): boolean {
  const ip = normaliserIp(ipAddress);
  if (!ip || ip === 'unknown') {
    return false;
  }

  if (ip.includes(':')) {
    return CLOUDFLARE_CIDR_V6.some((cidr) => cidrV6Contient(ip, cidr));
  }

  return CLOUDFLARE_CIDR_V4.some((cidr) => cidrV4Contient(ip, cidr));
}
