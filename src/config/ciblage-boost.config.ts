/**
 * Listes fermées de ciblage proposées au vendeur (port de boost_meta/src/lib/targeting.ts).
 *
 * Villes : clés géo Meta ; elles sont re-résolues au moment de la publication via
 * `search?type=adgeolocation` (si Meta refuse une clé, le nom de la ville sert à la retrouver).
 * Intérêts : stockés par CODE stable. L'ID Meta est résolu à la publication via
 * `search?type=adinterest` (les IDs « en dur » de boost_meta ne sont pas tous valides).
 */

export const PAYS_CIBLAGE = [
  { code: 'GA', nom: 'Gabon' },
  { code: 'CG', nom: 'Congo' },
  { code: 'CM', nom: 'Cameroun' },
  { code: 'GQ', nom: 'Guinée équatoriale' },
  { code: 'CD', nom: 'RD Congo' },
  { code: 'CI', nom: "Côte d'Ivoire" },
  { code: 'SN', nom: 'Sénégal' },
  { code: 'FR', nom: 'France' }
] as const;

export const VILLES_GABON = [
  { cle: '2420605', nom: 'Libreville' },
  { cle: '2396518', nom: 'Port-Gentil' },
  { cle: '2399697', nom: 'Franceville' },
  { cle: '2399888', nom: 'Oyem' },
  { cle: '2398073', nom: 'Moanda' },
  { cle: '2399692', nom: 'Lambaréné' },
  { cle: '2396259', nom: 'Tchibanga' },
  { cle: '2395377', nom: 'Makokou' }
] as const;

export const LANGUES_CIBLAGE = [
  { locale: '6', nom: 'Français' },
  { locale: '1', nom: 'Anglais' }
] as const;

/** `requete` = terme recherché dans `search?type=adinterest` (en anglais, langue de référence Meta). */
export const INTERETS_CIBLAGE = [
  { code: 'mode', nom: 'Mode', requete: 'Fashion' },
  { code: 'vetements', nom: 'Vêtements', requete: 'Clothing' },
  { code: 'chaussures', nom: 'Chaussures', requete: 'Shoes' },
  { code: 'beaute', nom: 'Beauté', requete: 'Beauty' },
  { code: 'cosmetiques', nom: 'Cosmétiques', requete: 'Cosmetics' },
  { code: 'coiffure', nom: 'Coiffure', requete: 'Hairstyle' },
  { code: 'bijoux', nom: 'Bijoux', requete: 'Jewelry' },
  { code: 'shopping', nom: 'Shopping', requete: 'Shopping' },
  { code: 'achats_en_ligne', nom: 'Achats en ligne', requete: 'Online shopping' },
  { code: 'electronique', nom: 'Électronique', requete: 'Consumer electronics' },
  { code: 'smartphones', nom: 'Smartphones', requete: 'Smartphones' },
  { code: 'informatique', nom: 'Informatique', requete: 'Computers' },
  { code: 'maison', nom: 'Maison & déco', requete: 'Interior design' },
  { code: 'cuisine', nom: 'Cuisine', requete: 'Cooking' },
  { code: 'restaurants', nom: 'Restaurants', requete: 'Restaurants' },
  { code: 'alimentation', nom: 'Alimentation', requete: 'Food' },
  { code: 'sport', nom: 'Sport', requete: 'Sports' },
  { code: 'fitness', nom: 'Fitness', requete: 'Physical fitness' },
  { code: 'football', nom: 'Football', requete: 'Association football (Soccer)' },
  { code: 'bebe', nom: 'Bébé & enfants', requete: 'Baby products' },
  { code: 'parents', nom: 'Parents', requete: 'Parenting' },
  { code: 'automobile', nom: 'Automobile', requete: 'Vehicles' },
  { code: 'voyages', nom: 'Voyages', requete: 'Travel' },
  { code: 'musique', nom: 'Musique', requete: 'Music' },
  { code: 'evenements', nom: 'Événements & sorties', requete: 'Events' },
  { code: 'entrepreneuriat', nom: 'Entrepreneuriat', requete: 'Entrepreneurship' }
] as const;

export const DUREES_BOOST = [3, 5, 7, 10, 14] as const;

export const AGE_MIN_CIBLAGE = 18;
export const AGE_MAX_CIBLAGE = 65;

export function nomVille(cle: string): string {
  return VILLES_GABON.find((v) => v.cle === cle)?.nom ?? cle;
}

export function nomPays(code: string): string {
  return PAYS_CIBLAGE.find((p) => p.code === code)?.nom ?? code;
}

export function interetParCode(code: string) {
  return INTERETS_CIBLAGE.find((i) => i.code === code) ?? null;
}

export const CODES_PAYS = PAYS_CIBLAGE.map((p) => p.code) as string[];
export const CLES_VILLES = VILLES_GABON.map((v) => v.cle) as string[];
export const LOCALES = LANGUES_CIBLAGE.map((l) => l.locale) as string[];
export const CODES_INTERETS = INTERETS_CIBLAGE.map((i) => i.code) as string[];
