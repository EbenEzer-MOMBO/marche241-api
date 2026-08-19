import { query } from '../config/database';
import { Vendeur, CreateVendeurData, ResultatPagine, OptionsPagination } from '../lib/database-types';
import { logger } from '../utils/logger';

/**
 * Colonnes autorisées pour le tri de la liste paginée.
 * Le nom de colonne étant interpolé dans le SQL, toute valeur hors de
 * cette liste est rejetée au profit du tri par défaut.
 */
const COLONNES_TRI = [
  'id',
  'nom',
  'email',
  'telephone',
  'ville',
  'statut',
  'date_creation',
  'date_modification',
  'derniere_connexion'
] as const;

/**
 * Colonnes modifiables via les méthodes de mise à jour.
 */
const COLONNES_AUTORISEES = [
  'telephone',
  'nom',
  'email',
  'code_verification',
  'code_expiration',
  'tentatives_code',
  'derniere_tentative',
  'statut',
  'photo_profil',
  'ville',
  'verification_telephone',
  'verification_email',
  'derniere_connexion',
  'numero_paiement'
] as const;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

export class VendeurModel {
  private static readonly TABLE_NAME = 'vendeurs';

  /**
   * Récupère tous les vendeurs avec pagination
   */
  static async getAllVendeurs(options: OptionsPagination): Promise<ResultatPagine<Vendeur>> {
    const { page, limite, tri_par = 'date_creation', ordre = 'DESC' } = options;

    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;

    // N'accepter que des valeurs connues : elles sont interpolées dans le SQL
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME}`
    );
    const count = Number(total[0].count);

    const { rows } = await query<Vendeur>(
      `SELECT * FROM ${this.TABLE_NAME}
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    // Calculer le nombre total de pages
    const total_pages = count ? Math.ceil(count / limite) : 0;

    return {
      donnees: rows,
      total: count,
      page,
      limite,
      total_pages
    };
  }

  /**
   * Récupère un vendeur par son ID
   */
  static async getVendeurById(id: number): Promise<Vendeur | null> {
    const { rows } = await query<Vendeur>(`SELECT * FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);

    return rows[0] ?? null;
  }

  /**
   * Récupère un vendeur par son numéro de téléphone
   */
  static async getVendeurByTelephone(telephone: string): Promise<Vendeur | null> {
    const { rows } = await query<Vendeur>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE telephone = $1`,
      [telephone]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère un vendeur par son email
   */
  static async getVendeurByEmail(email: string): Promise<Vendeur | null> {
    const { rows } = await query<Vendeur>(`SELECT * FROM ${this.TABLE_NAME} WHERE email = $1`, [email]);

    return rows[0] ?? null;
  }

  /**
   * Crée un nouveau vendeur
   */
  static async createVendeur(vendeurData: CreateVendeurData): Promise<Vendeur> {
    // Ajouter les champs par défaut
    const champs = filtrerColonnes({
      ...vendeurData,
      statut: 'en_attente_verification',
      tentatives_code: 0,
      verification_telephone: false,
      verification_email: false
    });

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map((_, i) => `$${i + 1}`);

    const { rows } = await query<Vendeur>(
      `INSERT INTO ${this.TABLE_NAME} (${colonnes.join(', ')}, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING *`,
      champs.map(([, valeur]) => valeur)
    );

    return rows[0];
  }

  /**
   * Met à jour un vendeur existant
   */
  static async updateVendeur(id: number, vendeurData: Partial<Vendeur>): Promise<Vendeur> {
    // `id` et `date_creation` ne figurent pas dans les colonnes autorisées
    const champs = filtrerColonnes(vendeurData as Record<string, unknown>);

    if (champs.length === 0) {
      const { rows } = await query<Vendeur>(
        `UPDATE ${this.TABLE_NAME} SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (!rows[0]) {
        throw new Error('Erreur lors de la mise à jour du vendeur: vendeur introuvable');
      }

      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = $${i + 1}`);

    const { rows } = await query<Vendeur>(
      `UPDATE ${this.TABLE_NAME} SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du vendeur: vendeur introuvable');
    }

    return rows[0];
  }

  /**
   * Supprime un vendeur
   */
  static async deleteVendeur(id: number): Promise<void> {
    await query(`DELETE FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);
  }

  /**
   * Met à jour le statut d'un vendeur
   */
  static async updateVendeurStatus(id: number, statut: string): Promise<Vendeur> {
    const { rows } = await query<Vendeur>(
      `UPDATE ${this.TABLE_NAME}
       SET statut = $1::statut_vendeur, date_modification = NOW()
       WHERE id = $2
       RETURNING *`,
      [statut, id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du statut du vendeur: vendeur introuvable');
    }

    return rows[0];
  }

  /**
   * Génère un code de vérification pour un vendeur (par téléphone)
   */
  static async generateVerificationCode(telephone: string): Promise<string> {
    // Générer un code à 4 chiffres
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Définir l'expiration à 10 minutes
    await query(
      `UPDATE ${this.TABLE_NAME}
       SET code_verification = $1,
           code_expiration = NOW() + INTERVAL '10 minutes',
           tentatives_code = 0
       WHERE telephone = $2`,
      [code, telephone]
    );

    return code;
  }

  /**
   * Inscription complète d'un vendeur avec envoi du code de vérification
   */
  static async inscrireVendeur(data: CreateVendeurData): Promise<{ vendeur: Vendeur; code: string }> {
    const { email, nom, telephone, ville } = data;

    // Vérifier que l'email est fourni
    if (!email) {
      throw new Error('L\'adresse email est requise pour l\'inscription');
    }

    logger.debug(`[VendeurModel] Inscription du vendeur: ${email}`);

    // Vérifier si l'email existe déjà
    const vendeurExistantEmail = await this.getVendeurByEmail(email);
    if (vendeurExistantEmail) {
      throw new Error('Un compte avec cette adresse email existe déjà');
    }

    // Vérifier si le téléphone existe déjà (seulement si fourni)
    if (telephone && telephone.trim() !== '') {
      const vendeurExistantTel = await this.getVendeurByTelephone(telephone);
      if (vendeurExistantTel) {
        throw new Error('Un compte avec ce numéro de téléphone existe déjà');
      }
    }

    // Générer un code de vérification
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      // Créer le vendeur avec le code de vérification, valable 30 minutes
      const { rows } = await query<Vendeur>(
        `INSERT INTO ${this.TABLE_NAME}
           (email, nom, telephone, ville, code_verification, code_expiration,
            tentatives_code, statut, verification_email, verification_telephone,
            date_creation, date_modification)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 minutes',
                 0, 'en_attente_verification', false, false, NOW(), NOW())
         RETURNING *`,
        [email, nom, telephone || '', ville || '', code]
      );

      logger.debug(`[VendeurModel] Vendeur créé avec succès: ID ${rows[0].id}`);

      return {
        vendeur: rows[0],
        code
      };
    } catch (error) {
      logger.error('[VendeurModel] Erreur lors de la création du vendeur:', error);

      // Gérer les erreurs de contrainte d'unicité
      const codeErreur = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : String(error);

      if (codeErreur === '23505') { // Code PostgreSQL pour violation de contrainte unique
        if (message.includes('vendeurs_email_key')) {
          throw new Error('Un compte avec cette adresse email existe déjà');
        } else if (message.includes('vendeurs_telephone_key')) {
          throw new Error('Un compte avec ce numéro de téléphone existe déjà');
        }
      }

      throw new Error(`Erreur lors de la création du vendeur: ${message}`);
    }
  }

  /**
   * Génère un code de vérification pour un vendeur (par email)
   */
  static async generateVerificationCodeByEmail(email: string): Promise<string> {
    // Générer un code à 6 chiffres pour l'email (plus sécurisé)
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    logger.debug(`[VendeurModel] Génération code pour ${email}`);

    // Mettre à jour le vendeur avec le nouveau code, valable 30 minutes
    await query(
      `UPDATE ${this.TABLE_NAME}
       SET code_verification = $1,
           code_expiration = NOW() + INTERVAL '30 minutes',
           tentatives_code = 0
       WHERE email = $2`,
      [code, email]
    );

    return code;
  }

  /**
   * Vérifie un code de vérification (par téléphone)
   */
  static async verifyCode(telephone: string, code: string): Promise<boolean> {
    return this.verifierCode('telephone', telephone, code, 'verification_telephone');
  }

  /**
   * Vérifie un code de vérification (par email)
   */
  static async verifyCodeByEmail(email: string, code: string): Promise<boolean> {
    return this.verifierCode('email', email, code, 'verification_email');
  }

  /**
   * Vérifie un code de vérification et active le compte si le code est valide.
   * L'expiration est évaluée par la base afin de ne dépendre d'aucun fuseau
   * horaire côté application.
   * @param champIdentifiant Colonne identifiant le vendeur (`email` ou `telephone`)
   * @param identifiant Valeur de cette colonne
   * @param code Code soumis par l'utilisateur
   * @param champVerification Colonne de vérification à activer
   */
  private static async verifierCode(
    champIdentifiant: 'email' | 'telephone',
    identifiant: string,
    code: string,
    champVerification: 'verification_email' | 'verification_telephone'
  ): Promise<boolean> {
    const { rows } = await query<{ code_verification: string | null; expire: boolean }>(
      `SELECT code_verification, (code_expiration IS NULL OR code_expiration < NOW()) AS expire
       FROM ${this.TABLE_NAME}
       WHERE ${champIdentifiant} = $1`,
      [identifiant]
    );

    if (!rows[0]) {
      return false;
    }

    if (rows[0].expire) {
      return false;
    }

    if (rows[0].code_verification !== code) {
      await query(
        `UPDATE ${this.TABLE_NAME}
         SET tentatives_code = tentatives_code + 1, derniere_tentative = NOW()
         WHERE ${champIdentifiant} = $1`,
        [identifiant]
      );

      return false;
    }

    await query(
      `UPDATE ${this.TABLE_NAME}
       SET ${champVerification} = true,
           statut = 'actif',
           code_verification = NULL,
           code_expiration = NULL,
           tentatives_code = 0,
           derniere_connexion = NOW()
       WHERE ${champIdentifiant} = $1`,
      [identifiant]
    );

    return true;
  }
}
