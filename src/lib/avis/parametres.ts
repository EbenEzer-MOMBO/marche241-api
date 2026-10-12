import { AutoApprobationAvis, AvisParametres } from '../database-types';

/** Valeurs de repli si la table n'a pas été initialisée (identiques à la migration 038). */
export const PARAMETRES_AVIS_DEFAUT: AvisParametres = {
  actif: false,
  delai_invitation_jours: 3,
  relance_jours: 10,
  validite_jeton_jours: 30,
  auto_approbation: 'aucune',
  seuil_affichage_note: 3,
  mots_interdits: [],
  longueur_max_commentaire: 1000
};

export const BORNES_PARAMETRES_AVIS: Record<string, [number, number]> = {
  delai_invitation_jours: [0, 60],
  relance_jours: [0, 60],
  validite_jeton_jours: [1, 180],
  seuil_affichage_note: [1, 50],
  longueur_max_commentaire: [100, 2000]
};

export const AUTO_APPROBATIONS_AVIS: AutoApprobationAvis[] = ['aucune', 'positifs_sans_texte_suspect'];

/** Convertit les lignes clé/valeur en paramètres typés (valeurs invalides → défaut). */
export function parserParametresAvis(lignes: Array<{ cle: string; valeur: string }>): AvisParametres {
  const p: AvisParametres = { ...PARAMETRES_AVIS_DEFAUT, mots_interdits: [] };
  for (const { cle, valeur } of lignes) {
    if (cle === 'actif') {
      p.actif = valeur === 'true';
    } else if (cle === 'auto_approbation') {
      if (AUTO_APPROBATIONS_AVIS.includes(valeur as AutoApprobationAvis)) p.auto_approbation = valeur as AutoApprobationAvis;
    } else if (cle === 'mots_interdits') {
      try {
        const liste: unknown = JSON.parse(valeur);
        if (Array.isArray(liste)) p.mots_interdits = liste.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
      } catch {
        /* valeur illisible : défaut */
      }
    } else if (cle in BORNES_PARAMETRES_AVIS) {
      const n = Number(valeur);
      const [min, max] = BORNES_PARAMETRES_AVIS[cle];
      if (Number.isInteger(n) && n >= min && n <= max) (p as unknown as Record<string, number>)[cle] = n;
    }
  }
  return p;
}

export function serialiserParametresAvis(parametres: Partial<AvisParametres>): Array<[string, string]> {
  return Object.entries(parametres)
    .filter(([cle, valeur]) => cle in PARAMETRES_AVIS_DEFAUT && valeur !== undefined)
    .map(([cle, valeur]) => [cle, cle === 'mots_interdits' ? JSON.stringify(valeur) : String(valeur)]);
}

/**
 * Statut initial d'un avis selon la politique d'auto-approbation.
 * Un avis suspect (filtre automatique) reste toujours en attente.
 */
export function statutInitialAvis(
  note: number,
  suspect: boolean,
  autoApprobation: AutoApprobationAvis
): 'en_attente' | 'approuve' {
  if (suspect) return 'en_attente';
  if (autoApprobation === 'positifs_sans_texte_suspect' && note >= 4) return 'approuve';
  return 'en_attente';
}
