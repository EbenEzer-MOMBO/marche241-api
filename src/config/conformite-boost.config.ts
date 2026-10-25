/**
 * Checklist de conformité cochée par l'équipe Marché 241 avant publication d'un boost.
 * Port de boost_meta/src/lib/compliance.ts, adapté à une marketplace.
 * Les points marqués `video` ne concernent que les boosts vidéo : ils ne sont ni affichés ni exigés pour une image.
 */

export interface ElementConformite {
  id: string;
  libelle: string;
  video?: true;
}

export const CONFORMITE_BOOST: readonly ElementConformite[] = [
  { id: 'interdit', libelle: 'Aucun produit interdit par Meta (armes, tabac, médicaments, contrefaçons, etc.)' },
  { id: 'allegations', libelle: 'Aucune allégation trompeuse (prix, promotions, résultats garantis)' },
  { id: 'ciblage', libelle: 'Ciblage non sensible (santé, politique, religion, mineurs)' },
  { id: 'visuel', libelle: 'Visuel net (image ou miniature vidéo), peu de texte, cohérent avec la boutique ou le produit' },
  { id: 'lisible', libelle: 'Texte de la publicité lisible (sous-titres si la vidéo parle)', video: true },
  { id: 'musique', libelle: 'Droits musicaux : pas de musique protégée sans licence', video: true }
];

export type ConformiteId = string;

export const IDS_CONFORMITE = CONFORMITE_BOOST.map((c) => c.id);

/** Points à cocher pour un boost : tous pour une vidéo, sans les points propres à la vidéo pour une image. */
export function conformiteRequise(mediaType: string | null | undefined): readonly ElementConformite[] {
  return mediaType === 'video' ? CONFORMITE_BOOST : CONFORMITE_BOOST.filter((item) => !item.video);
}

export function estConformiteComplete(cochees: string[], mediaType: string | null | undefined = 'image'): boolean {
  return conformiteRequise(mediaType).every((item) => cochees.includes(item.id));
}
