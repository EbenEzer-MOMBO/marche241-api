import { query } from '../config/database';
import { MetaConnexion } from '../lib/database-types';

/**
 * Accès SQL de la connexion Meta Ads (table meta_connexion, ligne unique id = 1, migration 028).
 * Aucun secret ici : jeton et secret d'app restent dans l'environnement de l'API.
 */

export interface ChoixConnexionMeta {
  ad_account_id: string;
  ad_account_nom: string | null;
  page_id: string;
  page_nom: string | null;
  instagram_id: string | null;
  instagram_nom: string | null;
  modifie_par: string | null;
}

export interface VerificationConnexionMeta {
  ad_account_nom?: string | null;
  devise?: string | null;
  fuseau?: string | null;
  statut_compte?: number | null;
  page_nom?: string | null;
  instagram_id?: string | null;
  instagram_nom?: string | null;
  jeton_valide: boolean | null;
  jeton_permissions: string[];
  jeton_expire_le: Date | null;
  message_erreur: string | null;
}

export class MetaConnexionModel {
  /** Ligne unique ; null si la migration 028 n'est pas appliquée ou la ligne absente. */
  static async lire(): Promise<MetaConnexion | null> {
    const { rows } = await query<MetaConnexion>(`SELECT * FROM meta_connexion WHERE id = 1`);
    return rows[0] ?? null;
  }

  /** Nouveau choix de compte / Page / Instagram : remet à zéro le résultat de vérification. */
  static async enregistrerChoix(choix: ChoixConnexionMeta): Promise<MetaConnexion> {
    const { rows } = await query<MetaConnexion>(
      `INSERT INTO meta_connexion (id, ad_account_id, ad_account_nom, page_id, page_nom, instagram_id, instagram_nom,
                                   devise, fuseau, statut_compte, verifie_le, message_erreur, modifie_par, date_modification)
       VALUES (1, $1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         ad_account_id = EXCLUDED.ad_account_id, ad_account_nom = EXCLUDED.ad_account_nom,
         page_id = EXCLUDED.page_id, page_nom = EXCLUDED.page_nom,
         instagram_id = EXCLUDED.instagram_id, instagram_nom = EXCLUDED.instagram_nom,
         devise = NULL, fuseau = NULL, statut_compte = NULL, verifie_le = NULL, message_erreur = NULL,
         modifie_par = EXCLUDED.modifie_par, date_modification = NOW()
       RETURNING *`,
      [choix.ad_account_id, choix.ad_account_nom, choix.page_id, choix.page_nom, choix.instagram_id, choix.instagram_nom, choix.modifie_par]
    );
    return rows[0];
  }

  /** Résultat d'une vérification auprès de Meta (les champs non fournis sont conservés). */
  static async enregistrerVerification(v: VerificationConnexionMeta): Promise<MetaConnexion> {
    await query(`INSERT INTO meta_connexion (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    const { rows } = await query<MetaConnexion>(
      `UPDATE meta_connexion SET
         ad_account_nom = COALESCE($1, ad_account_nom),
         devise = COALESCE($2, devise),
         fuseau = COALESCE($3, fuseau),
         statut_compte = COALESCE($4, statut_compte),
         page_nom = COALESCE($5, page_nom),
         instagram_id = CASE WHEN $10::boolean THEN $6 ELSE instagram_id END,
         instagram_nom = CASE WHEN $10::boolean THEN $7 ELSE instagram_nom END,
         jeton_valide = $8,
         jeton_permissions = $9,
         jeton_expire_le = $11,
         message_erreur = $12,
         verifie_le = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        v.ad_account_nom ?? null,
        v.devise ?? null,
        v.fuseau ?? null,
        v.statut_compte ?? null,
        v.page_nom ?? null,
        v.instagram_id ?? null,
        v.instagram_nom ?? null,
        v.jeton_valide,
        v.jeton_permissions,
        v.instagram_id !== undefined,
        v.jeton_expire_le,
        v.message_erreur
      ]
    );
    return rows[0];
  }
}
