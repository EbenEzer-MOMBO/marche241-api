/**
 * Listes fermées de ciblage proposées au vendeur (port de boost_meta/src/lib/targeting.ts).
 *
 * Les choix du vendeur sont stockés par CODE stable (`ciblage.villes`, `ciblage.interets`). Les
 * identifiants Meta correspondants sont FIGÉS ici, après vérification manuelle dans
 * `search?type=adgeolocation` et `search?type=adinterest` (catégories génériques, jamais des marques).
 * Aucune recherche n'est faite à la publication, et l'estimation d'audience utilise exactement le
 * même ciblage que la publicité.
 *
 * Ajouter un intérêt : chercher l'id dans Graph (`search?type=adinterest&q=…&locale=fr_FR`) en
 * préférant les catégories suffixées « (habillement) », « (musique) »…, puis vérifier la liste avec
 * `npm test` (unicité des codes et des ids).
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

/** `cle` = code stocké (ancien identifiant GeoNames, conservé pour les boosts existants) ; `meta` = clé géo Meta. */
export const VILLES_GABON = [
  { cle: '2420605', nom: 'Libreville', meta: '800232' },
  { cle: '2396518', nom: 'Port-Gentil', meta: '801981' },
  { cle: '2399697', nom: 'Franceville', meta: '799713' },
  { cle: '2399888', nom: 'Oyem', meta: '801906' },
  { cle: '2398073', nom: 'Moanda', meta: '801050' },
  { cle: '2399692', nom: 'Lambaréné', meta: '800110' },
  { cle: '2396259', nom: 'Tchibanga', meta: '802123' },
  { cle: '2395377', nom: 'Makokou', meta: '800424' }
] as const;

export const LANGUES_CIBLAGE = [
  { locale: '6', nom: 'Français' },
  { locale: '1', nom: 'Anglais' }
] as const;

export const GROUPES_INTERETS = [
  { code: 'mode_beaute', nom: 'Mode & beauté' },
  { code: 'shopping_tech', nom: 'Shopping & high-tech' },
  { code: 'maison_food', nom: 'Maison & food' },
  { code: 'sport_loisirs', nom: 'Sport, voyages & sorties' },
  { code: 'famille_pro', nom: 'Famille & business' },
  { code: 'pop_culture', nom: 'Culture pop' }
] as const;

type CodeGroupe = (typeof GROUPES_INTERETS)[number]['code'];

/** `meta` = intérêts Meta (id + nom FR tel qu'affiché par Meta), combinés en OU dans `flexible_spec`. */
export const INTERETS_CIBLAGE: ReadonlyArray<{
  code: string;
  nom: string;
  groupe: CodeGroupe;
  meta: ReadonlyArray<{ id: string; nom: string }>;
}> = [
  // Mode & beauté
  { code: 'mode', nom: 'Mode', groupe: 'mode_beaute', meta: [
    { id: '6003348604581', nom: 'Accessoires de mode' },
    { id: '6003446154680', nom: 'Mode de rue' },
    { id: '6003266266843', nom: 'Dessin de mode' }
  ] },
  { code: 'vetements', nom: 'Vêtements', groupe: 'mode_beaute', meta: [
    { id: '6003456388203', nom: 'Habillement' },
    { id: '6011366104268', nom: 'Vêtements pour femmes' },
    { id: '6011994253127', nom: 'Vêtements pour hommes' }
  ] },
  { code: 'chaussures', nom: 'Chaussures', groupe: 'mode_beaute', meta: [
    { id: '6003348453981', nom: 'Chaussures' },
    { id: '6003384587151', nom: 'Sneakers' }
  ] },
  { code: 'beaute', nom: 'Beauté', groupe: 'mode_beaute', meta: [
    { id: '6002867432822', nom: 'Beauté' },
    { id: '6003088846792', nom: 'Salons de beauté' }
  ] },
  { code: 'cosmetiques', nom: 'Cosmétiques', groupe: 'mode_beaute', meta: [{ id: '6002839660079', nom: 'Cosmétiques' }] },
  { code: 'coiffure', nom: 'Coiffure', groupe: 'mode_beaute', meta: [
    { id: '6003255496088', nom: 'Coiffure' },
    { id: '6003456330903', nom: 'Produits capillaires' }
  ] },
  { code: 'bijoux', nom: 'Bijoux', groupe: 'mode_beaute', meta: [{ id: '6003266225248', nom: 'Bijoux' }] },

  // Shopping & high-tech
  { code: 'shopping', nom: 'Shopping', groupe: 'shopping_tech', meta: [{ id: '6003263791114', nom: 'Shopping' }] },
  { code: 'achats_en_ligne', nom: 'Achats en ligne', groupe: 'shopping_tech', meta: [
    { id: '6003346592981', nom: 'Shopping en ligne' },
    { id: '6003221485467', nom: 'E-commerce' }
  ] },
  { code: 'electronique', nom: 'Électronique', groupe: 'shopping_tech', meta: [
    { id: '6003716669862', nom: 'Électronique grand public' }
  ] },
  { code: 'smartphones', nom: 'Smartphones', groupe: 'shopping_tech', meta: [
    { id: '6003289911338', nom: 'Smartphones' },
    { id: '6002971085794', nom: 'Téléphones mobiles' }
  ] },
  { code: 'informatique', nom: 'Informatique', groupe: 'shopping_tech', meta: [
    { id: '6003404634364', nom: 'Ordinateurs' },
    { id: '6002960574320', nom: 'Tablettes' }
  ] },

  // Maison & food
  { code: 'maison', nom: 'Maison & déco', groupe: 'maison_food', meta: [
    { id: '6002920953955', nom: 'Décoration intérieure' },
    { id: '6003132926214', nom: 'Meubles' }
  ] },
  { code: 'cuisine', nom: 'Cuisine', groupe: 'maison_food', meta: [{ id: '6003659420716', nom: 'Cuisine' }] },
  { code: 'restaurants', nom: 'Restaurants', groupe: 'maison_food', meta: [
    { id: '6003436950375', nom: 'Restaurants' },
    { id: '6003372667195', nom: 'Fast-foods' }
  ] },
  { code: 'alimentation', nom: 'Alimentation', groupe: 'maison_food', meta: [
    { id: '6009248606271', nom: 'Nourriture et boissons' },
    { id: '6003529536463', nom: 'Foodie' }
  ] },

  // Sport, voyages & sorties
  { code: 'sport', nom: 'Sport', groupe: 'sport_loisirs', meta: [{ id: '6003269553527', nom: 'Sport' }] },
  { code: 'fitness', nom: 'Fitness', groupe: 'sport_loisirs', meta: [
    { id: '6003384248805', nom: 'Fitness et bien-être' },
    { id: '6003277229371', nom: 'Remise en forme physique' }
  ] },
  { code: 'football', nom: 'Football', groupe: 'sport_loisirs', meta: [{ id: '6003107902433', nom: 'Football' }] },
  { code: 'automobile', nom: 'Automobile', groupe: 'sport_loisirs', meta: [
    { id: '6003176678152', nom: 'Automobiles' },
    { id: '6003133486214', nom: 'Véhicules' }
  ] },
  { code: 'voyages', nom: 'Voyages', groupe: 'sport_loisirs', meta: [
    { id: '6004160395895', nom: 'Voyage' },
    { id: '6003430696269', nom: 'Tourisme' }
  ] },
  { code: 'musique', nom: 'Musique', groupe: 'sport_loisirs', meta: [
    { id: '6003332483177', nom: 'Vidéos musicales' },
    { id: '6002970406974', nom: 'Concerts' }
  ] },
  { code: 'evenements', nom: 'Événements & sorties', groupe: 'sport_loisirs', meta: [
    { id: '6003147868152', nom: 'Fêtes' },
    { id: '6003375995381', nom: 'Vie nocturne' },
    { id: '6003108826384', nom: 'Festivals musicaux' }
  ] },

  // Famille & business
  { code: 'bebe', nom: 'Bébé & enfants', groupe: 'famille_pro', meta: [
    { id: '6003415393053', nom: 'Vêtements pour enfants' },
    { id: '6003727402691', nom: 'Poussette' }
  ] },
  { code: 'parents', nom: 'Parents', groupe: 'famille_pro', meta: [{ id: '6002991239659', nom: 'Parentalité' }] },
  { code: 'entrepreneuriat', nom: 'Entrepreneuriat', groupe: 'famille_pro', meta: [
    { id: '6003371567474', nom: 'Entrepreneuriat' },
    { id: '6002884511422', nom: 'Petites entreprises' }
  ] },

  // Culture pop
  { code: 'animes', nom: 'Animes', groupe: 'pop_culture', meta: [
    { id: '6003143359761', nom: 'Fans d’anime et de mangas' },
    { id: '6002891048622', nom: 'Anime & Cosplay' }
  ] },
  { code: 'mangas', nom: 'Mangas', groupe: 'pop_culture', meta: [{ id: '6003083357650', nom: 'Manga' }] },
  { code: 'dessins_animes', nom: 'Dessins animés', groupe: 'pop_culture', meta: [{ id: '6003527302595', nom: 'Dessin animé' }] },
  { code: 'comics', nom: 'Comics & super-héros', groupe: 'pop_culture', meta: [
    { id: '6003126215349', nom: 'Bandes dessinées' },
    { id: '6002985449320', nom: 'Super-héros' }
  ] },
  { code: 'cosplay', nom: 'Cosplay', groupe: 'pop_culture', meta: [{ id: '6003381567337', nom: 'Cosplay' }] },
  { code: 'jeux_video', nom: 'Jeux vidéo', groupe: 'pop_culture', meta: [
    { id: '6003940339466', nom: 'Jeux vidéo' },
    { id: '6003717913546', nom: 'Gamer·euse' }
  ] },
  { code: 'jeux_mobiles', nom: 'Jeux mobiles', groupe: 'pop_culture', meta: [{ id: '6003158198275', nom: 'Jeu sur mobile' }] },
  { code: 'esport', nom: 'E-sport', groupe: 'pop_culture', meta: [{ id: '6003402262239', nom: 'Esports' }] },
  { code: 'series', nom: 'Séries & streaming', groupe: 'pop_culture', meta: [
    { id: '6003378723965', nom: 'Netflix' },
    { id: '6003067583093', nom: 'Feuilleton' }
  ] },
  { code: 'cinema', nom: 'Cinéma', groupe: 'pop_culture', meta: [{ id: '6003139266461', nom: 'Films' }] },
  { code: 'kpop', nom: 'K-pop', groupe: 'pop_culture', meta: [{ id: '6003339140579', nom: 'K-Pop' }] },
  { code: 'hip_hop', nom: 'Hip-hop & RnB', groupe: 'pop_culture', meta: [
    { id: '6003225556345', nom: 'Musique hip-hop' },
    { id: '6003180715102', nom: 'RnB contemporain' }
  ] },
  { code: 'afro', nom: 'Afrobeat & musiques africaines', groupe: 'pop_culture', meta: [
    { id: '6003484812986', nom: 'Afrobeat' },
    { id: '6003359282604', nom: 'Musique africaine' }
  ] }
];

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

/** Codes de villes stockés → clés géo Meta (codes inconnus ignorés). */
export function clesMetaVilles(codes: readonly string[]): string[] {
  return codes.flatMap((c) => {
    const ville = VILLES_GABON.find((v) => v.cle === c);
    return ville ? [ville.meta] : [];
  });
}

/** Codes d'intérêts stockés → ids d'intérêts Meta, dédoublonnés (codes inconnus ignorés). */
export function idsMetaInterets(codes: readonly string[]): string[] {
  const ids = codes.flatMap((c) => interetParCode(c)?.meta.map((m) => m.id) ?? []);
  return Array.from(new Set(ids));
}

export const CODES_PAYS = PAYS_CIBLAGE.map((p) => p.code) as string[];
export const CLES_VILLES = VILLES_GABON.map((v) => v.cle) as string[];
export const LOCALES = LANGUES_CIBLAGE.map((l) => l.locale) as string[];
export const CODES_INTERETS = INTERETS_CIBLAGE.map((i) => i.code) as string[];
