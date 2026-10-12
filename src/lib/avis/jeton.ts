import crypto from 'crypto';

/**
 * Jetons des invitations à laisser un avis.
 * Le jeton en clair n'existe que dans le lien envoyé au client : seule son empreinte SHA-256 est stockée.
 */

const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url, sans remplissage

export function genererJetonAvis(): { jeton: string; hash: string } {
  const jeton = crypto.randomBytes(32).toString('base64url');
  return { jeton, hash: hacherJetonAvis(jeton) };
}

export function hacherJetonAvis(jeton: string): string {
  return crypto.createHash('sha256').update(jeton, 'utf8').digest('hex');
}

/** Rejette tôt les jetons mal formés (évite une requête SQL inutile). */
export function jetonAvisBienForme(jeton: unknown): jeton is string {
  return typeof jeton === 'string' && FORMAT_JETON.test(jeton);
}

/** Empreinte salée d'une adresse IP (jamais l'IP en clair). */
export function hacherIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const sel = process.env.AVIS_IP_SALT || process.env.JWT_SECRET || 'marche241-avis';
  return crypto.createHash('sha256').update(`${sel}:${ip}`, 'utf8').digest('hex');
}
