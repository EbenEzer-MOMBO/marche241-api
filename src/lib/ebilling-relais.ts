/**
 * Relais eBilling temporaire.
 *
 * eBilling filtre par adresse IP (adresses uniques, pas de plage) et Render n'a pas d'IP sortante
 * fixe. Si EBILLING_RELAY_URL est défini, les appels eBilling transitent par le relais Eventime
 * (route /internal/ebilling-relay, protégée par EBILLING_RELAY_KEY) dont l'IP est autorisée.
 * Sans EBILLING_RELAY_URL, les appels partent directement (comportement historique).
 */

export interface RequeteEbilling {
  url: string;
  headers: Record<string, string>;
  auth?: { username: string; password: string };
}

export function viaRelaisEbilling(requete: RequeteEbilling): RequeteEbilling {
  const relais = process.env.EBILLING_RELAY_URL;
  if (!relais) return requete;

  if (!/^https:\/\//i.test(relais)) {
    throw new Error('EBILLING_RELAY_URL doit être en https (les identifiants eBilling transitent par le relais)');
  }

  const cle = process.env.EBILLING_RELAY_KEY || '';
  if (!cle) {
    throw new Error('EBILLING_RELAY_URL est défini mais EBILLING_RELAY_KEY est vide');
  }

  const { Authorization, Accept, ...autres } = requete.headers;
  const headers: Record<string, string> = {
    ...autres,
    'X-Relay-Key': cle,
    'X-Relay-Target': requete.url,
  };
  if (Accept) headers['X-Relay-Accept'] = Accept;

  if (requete.auth) {
    const basic = Buffer.from(`${requete.auth.username}:${requete.auth.password}`).toString('base64');
    headers['X-Relay-Authorization'] = `Basic ${basic}`;
  } else if (Authorization) {
    headers['X-Relay-Authorization'] = Authorization;
  }

  return { url: relais, headers };
}
