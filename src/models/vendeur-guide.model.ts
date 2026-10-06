import { query } from '../config/database';
import { GuideVendeur, StatutGuideVendeur } from '../lib/database-types';

/** Visites guidées de l'espace vendeur (table vendeur_guides, migration 030). */

/** Visites guidées existantes (liste blanche des routes). */
export const GUIDES_VENDEUR = ['publicite'] as const;

export class VendeurGuideModel {
  static async lister(vendeurId: number): Promise<GuideVendeur[]> {
    const { rows } = await query<GuideVendeur>(
      `SELECT vendeur_id, guide, statut, date_modification FROM vendeur_guides WHERE vendeur_id = $1`,
      [vendeurId]
    );
    return rows;
  }

  /** Enregistre l'issue d'une visite. Une visite terminée ne redevient jamais « passée ». */
  static async enregistrer(vendeurId: number, guide: string, statut: StatutGuideVendeur): Promise<GuideVendeur> {
    const { rows } = await query<GuideVendeur>(
      `INSERT INTO vendeur_guides (vendeur_id, guide, statut, date_modification)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (vendeur_id, guide) DO UPDATE SET
         statut = CASE WHEN vendeur_guides.statut = 'termine' THEN 'termine' ELSE EXCLUDED.statut END,
         date_modification = NOW()
       RETURNING vendeur_id, guide, statut, date_modification`,
      [vendeurId, guide, statut]
    );
    return rows[0];
  }
}
