/**
 * Fuseau horaire IANA du navigateur → code pays ISO-2.
 * Un VPN ne modifie pas le fuseau du téléphone : c'est la source du pays
 * du visiteur. Fuseau absent de la liste → retour à la géolocalisation IP.
 */
export const FUSEAU_VERS_PAYS: Readonly<Record<string, string>> = {
  // Afrique centrale et de l'Ouest
  'Africa/Libreville': 'GA',
  'Africa/Douala': 'CM',
  'Africa/Brazzaville': 'CG',
  'Africa/Kinshasa': 'CD',
  'Africa/Lubumbashi': 'CD',
  'Africa/Malabo': 'GQ',
  'Africa/Bangui': 'CF',
  'Africa/Ndjamena': 'TD',
  'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN',
  'Africa/Lome': 'TG',
  'Africa/Porto-Novo': 'BJ',
  'Africa/Sao_Tome': 'ST',
  'Africa/Luanda': 'AO',
  'Africa/Casablanca': 'MA',
  'Africa/Johannesburg': 'ZA',
  // Europe (diaspora)
  'Europe/Paris': 'FR',
  'Europe/Brussels': 'BE',
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Zurich': 'CH',
  'Europe/Amsterdam': 'NL',
  'Europe/Lisbon': 'PT',
  // Amérique du Nord
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Montreal': 'CA'
};

/**
 * Fuseaux partagés par plusieurs pays. Windows rattache « Afrique centrale-Ouest
 * (UTC+1) » à Africa/Lagos : un PC à Libreville le renvoie. On ne peut alors que
 * confirmer le pays de l'IP s'il appartient à la zone.
 */
export const FUSEAUX_AMBIGUS: Readonly<Record<string, readonly string[]>> = {
  'Africa/Lagos': ['NG', 'GA', 'CM', 'CG', 'CD', 'GQ', 'CF', 'TD', 'BJ', 'NE', 'AO']
};

export function paysPossiblesDuFuseau(fuseau?: string | null): readonly string[] | null {
  if (!fuseau) {
    return null;
  }

  return FUSEAUX_AMBIGUS[fuseau.trim()] ?? null;
}

export function paysDepuisFuseau(fuseau?: string | null): string | null {
  if (!fuseau) {
    return null;
  }

  return FUSEAU_VERS_PAYS[fuseau.trim()] ?? null;
}
