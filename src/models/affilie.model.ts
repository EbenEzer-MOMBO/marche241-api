import { query } from '../config/database';
import { Affilie, CreateAffilieData } from '../lib/database-types';
import { logger } from '../utils/logger';

/**
 * Colonnes modifiables via les méthodes de mise à jour.
 */
const COLONNES_AUTORISEES = ['nom', 'email', 'telephone', 'pays', 'statut', 'taux_commission'] as const;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) => (COLONNES_AUTORISEES as readonly string[]).includes(colonne));

export class AffilieModel {
  private static readonly TABLE_NAME = 'affilies';

  /**
   * Génère un code affilié unique, format AFF-XXXXXX.
   * Reprend le principe de vérification d'unicité en base utilisé par
   * CommandeModel.generateNumeroCommande, sur un espace de valeurs plus large
   * puisque ce code est amené à vivre indéfiniment (pas de préfixe par mois).
   */
  static async genererCodeUnique(): Promise<string> {
    for (let tentative = 0; tentative < 10; tentative++) {
      const suffixe = Math.floor(100000 + Math.random() * 900000).toString();
      const code = `AFF-${suffixe}`;

      const { rows } = await query<{ id: number }>(`SELECT id FROM ${this.TABLE_NAME} WHERE code = $1`, [code]);

      if (rows.length === 0) {
        return code;
      }
    }

    throw new Error('Impossible de générer un code affilié unique après plusieurs tentatives');
  }

  /**
   * Récupère un affilié par son code de tracking
   */
  static async getByCode(code: string): Promise<Affilie | null> {
    const { rows } = await query<Affilie>(`SELECT * FROM ${this.TABLE_NAME} WHERE code = $1`, [code]);
    return rows[0] ?? null;
  }

  /**
   * Récupère un affilié par son ID
   */
  static async getById(id: number): Promise<Affilie | null> {
    const { rows } = await query<Affilie>(`SELECT * FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  /**
   * Récupère un affilié par email
   */
  static async getByEmail(email: string): Promise<Affilie | null> {
    const { rows } = await query<Affilie>(`SELECT * FROM ${this.TABLE_NAME} WHERE email = $1`, [email]);
    return rows[0] ?? null;
  }

  /**
   * Récupère un affilié par email OU téléphone, pour la vérification d'unicité à l'inscription
   */
  static async getByEmailOuTelephone(email: string, telephone: string): Promise<Affilie | null> {
    const { rows } = await query<Affilie>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE email = $1 OR telephone = $2`,
      [email, telephone]
    );
    return rows[0] ?? null;
  }

  /**
   * Crée un nouvel affilié avec un code unique et le taux de commission par défaut
   */
  static async create(data: CreateAffilieData): Promise<Affilie> {
    const code = await this.genererCodeUnique();

    const champs = filtrerColonnes({
      ...data,
      code,
      statut: 'actif'
    } as unknown as Record<string, unknown>);

    // `code` n'est pas dans COLONNES_AUTORISEES (jamais modifiable après création) :
    // on l'ajoute explicitement à la requête d'insertion.
    const colonnes = [...champs.map(([colonne]) => colonne), 'code'];
    const valeurs = [...champs.map(([, valeur]) => valeur), code];
    const placeholders = colonnes.map((_, i) => `$${i + 1}`);

    try {
      const { rows } = await query<Affilie>(
        `INSERT INTO ${this.TABLE_NAME} (${colonnes.join(', ')}, date_creation, date_modification)
         VALUES (${placeholders.join(', ')}, NOW(), NOW())
         RETURNING *`,
        valeurs
      );

      logger.debug(`[AffilieModel] Affilié créé avec succès: ID ${rows[0].id}, code ${rows[0].code}`);

      return rows[0];
    } catch (error) {
      const codeErreur = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : String(error);

      if (codeErreur === '23505') {
        if (message.includes('affilies_email_key')) {
          throw new Error('Un compte affilié avec cette adresse email existe déjà');
        } else if (message.includes('affilies_telephone_key')) {
          throw new Error('Un compte affilié avec ce numéro de téléphone existe déjà');
        }
      }

      throw new Error(`Erreur lors de la création de l'affilié: ${message}`);
    }
  }

  /**
   * Met à jour le profil d'un affilié (WhatsApp/email/pays) — n'autorise pas
   * la modification du taux de commission, réservée à updateTauxCommission.
   */
  static async updateProfil(
    id: number,
    data: Partial<Pick<Affilie, 'nom' | 'email' | 'telephone' | 'pays'>>
  ): Promise<Affilie> {
    const champs = filtrerColonnes(data as Record<string, unknown>);

    if (champs.length === 0) {
      const { rows } = await query<Affilie>(
        `UPDATE ${this.TABLE_NAME} SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      if (!rows[0]) {
        throw new Error('Affilié introuvable');
      }
      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = $${i + 1}`);

    const { rows } = await query<Affilie>(
      `UPDATE ${this.TABLE_NAME} SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    if (!rows[0]) {
      throw new Error('Affilié introuvable');
    }

    return rows[0];
  }

  /**
   * Modifie le taux de commission d'un affilié — action financière sensible,
   * gérée à part de updateProfil (l'admin y applique une permission dédiée).
   * N'affecte jamais rétroactivement les commissions déjà créées : le trigger
   * SQL copie le taux en vigueur dans commissions_affiliees.taux à la création.
   */
  static async updateTauxCommission(id: number, tauxCommission: number): Promise<Affilie> {
    const { rows } = await query<Affilie>(
      `UPDATE ${this.TABLE_NAME}
       SET taux_commission = $1, date_modification = NOW()
       WHERE id = $2
       RETURNING *`,
      [tauxCommission, id]
    );

    if (!rows[0]) {
      throw new Error('Affilié introuvable');
    }

    return rows[0];
  }

  /**
   * Active ou désactive un affilié
   */
  static async updateStatut(id: number, statut: 'actif' | 'inactif'): Promise<Affilie> {
    const { rows } = await query<Affilie>(
      `UPDATE ${this.TABLE_NAME}
       SET statut = $1, date_modification = NOW()
       WHERE id = $2
       RETURNING *`,
      [statut, id]
    );

    if (!rows[0]) {
      throw new Error('Affilié introuvable');
    }

    return rows[0];
  }
}
