import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import {
  BannierePubliciteDiffusee,
  CreneauPublicite,
  FormulePublicite,
  PagePublicite,
  Publicite,
  PubliciteEvenement,
  PubliciteParametres,
  StatsPublicite,
  StatutPublicite,
  StatutRemboursementBoost,
  Transaction,
  TypeAnnonceurPublicite,
  TypeInteractionPublicite
} from '../lib/database-types';
import { LigneReservation } from '../lib/publicite/creneaux';

/**
 * Accès SQL de la publicité interne (tables publicites, publicite_reservations, publicite_interactions,
 * publicite_evenements, publicite_parametres, et transactions de type 'publicite').
 */

/** Colonnes modifiables via `mettreAJour` / `creer` (noms interpolés : liste blanche obligatoire). */
const COLONNES_AUTORISEES = [
  'type_annonceur',
  'boutique_id',
  'vendeur_id',
  'annonceur_nom',
  'annonceur_contact',
  'formule',
  'categorie_id',
  'statut',
  'semaine_debut',
  'nb_semaines',
  'semaines_offertes',
  'date_debut',
  'date_fin',
  'image_url',
  'image_mobile_url',
  'texte_alternatif',
  'cible_type',
  'produit_id',
  'url_destination',
  'prix_semaine_fcfa',
  'remise_fcfa',
  'frais_encaissement_fcfa',
  'total_fcfa',
  'mode_paiement',
  'reference_paiement_externe',
  'note_revue',
  'valide_par',
  'date_validation',
  'publication_reseaux_faite',
  'statut_remboursement',
  'montant_a_rembourser_fcfa',
  'date_remboursement',
  'note_remboursement',
  'date_soumission',
  'date_paiement',
  'date_cloture'
] as const;

export type ColonnePublicite = (typeof COLONNES_AUTORISEES)[number];
export type DonneesPublicite = Partial<Record<ColonnePublicite, unknown>>;

const COLONNES_ENUM: Record<string, string> = {
  type_annonceur: 'type_annonceur_publicite',
  formule: 'formule_publicite',
  statut: 'statut_publicite',
  mode_paiement: 'mode_paiement_publicite',
  statut_remboursement: 'statut_remboursement_boost'
};

const filtrerColonnes = (donnees: DonneesPublicite): Array<[string, unknown]> =>
  Object.entries(donnees).filter(
    ([colonne, valeur]) => (COLONNES_AUTORISEES as readonly string[]).includes(colonne) && valeur !== undefined
  );

const placeholder = (colonne: string, position: number): string => {
  if (COLONNES_ENUM[colonne]) return `$${position}::${COLONNES_ENUM[colonne]}`;
  if (colonne === 'semaine_debut') return `$${position}::date`;
  return `$${position}`;
};

/** Colonnes de sélection : la semaine en AAAA-MM-JJ et les relations utiles à l'affichage. */
const SELECTION = `p.*, to_char(p.semaine_debut, 'YYYY-MM-DD') AS semaine_debut,
  (SELECT json_build_object('id', b.id, 'nom', b.nom, 'slug', b.slug, 'logo', b.logo)
     FROM boutiques b WHERE b.id = p.boutique_id) AS boutique,
  (SELECT json_build_object('id', c.id, 'nom', c.nom, 'slug', c.slug)
     FROM categories c WHERE c.id = p.categorie_id) AS categorie,
  (SELECT pr.nom FROM produits pr WHERE pr.id = p.produit_id) AS produit_nom`;

/** Totaux de diffusion (affichages et clics), joints aux listes. */
const JOINTURE_TOTAUX = `LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE i.type = 'affichage')::int AS affichages,
           COUNT(*) FILTER (WHERE i.type = 'clic')::int AS clics
    FROM publicite_interactions i WHERE i.publicite_id = p.id
  ) tot ON TRUE`;

type Executeur = Pick<PoolClient, 'query'>;
const executeurParDefaut: Executeur = { query: ((text: string, params?: unknown[]) => query(text, params)) as PoolClient['query'] };

export type PubliciteAvecTotaux = Publicite & { totaux: { affichages: number; clics: number } };

export interface FiltresPublicitesAdmin {
  statut?: StatutPublicite;
  type_annonceur?: TypeAnnonceurPublicite;
  formule?: FormulePublicite;
  statut_remboursement?: StatutRemboursementBoost;
  recherche?: string;
  page?: number;
  limite?: number;
}

/** Conflit d'exclusivité : une des semaines demandées est déjà prise sur ce créneau. */
export class ReservationConflitError extends Error {
  constructor() {
    super('Une des semaines choisies vient d\'être réservée par un autre annonceur');
    this.name = 'ReservationConflitError';
  }
}

export class PubliciteModel {
  static async creer(donnees: DonneesPublicite & { annonceur_nom: string }, executeur: Executeur = executeurParDefaut): Promise<Publicite> {
    const champs = filtrerColonnes(donnees);
    const { rows } = await executeur.query<Publicite>(
      `INSERT INTO publicites (${champs.map(([c]) => c).join(', ')})
       VALUES (${champs.map(([c], i) => placeholder(c, i + 1)).join(', ')}) RETURNING id`,
      champs.map(([, v]) => v)
    );
    const creee = await PubliciteModel.getById(rows[0].id, executeur);
    return creee as Publicite;
  }

  static async getById(id: number, executeur: Executeur = executeurParDefaut): Promise<Publicite | null> {
    const { rows } = await executeur.query<Publicite>(`SELECT ${SELECTION} FROM publicites p WHERE p.id = $1`, [id]);
    return rows[0] ?? null;
  }

  static async listerParBoutique(boutiqueId: number): Promise<PubliciteAvecTotaux[]> {
    const { rows } = await query<PubliciteAvecTotaux>(
      `SELECT ${SELECTION}, json_build_object('affichages', COALESCE(tot.affichages, 0), 'clics', COALESCE(tot.clics, 0)) AS totaux
       FROM publicites p ${JOINTURE_TOTAUX}
       WHERE p.boutique_id = $1
       ORDER BY p.date_modification DESC`,
      [boutiqueId]
    );
    return rows;
  }

  static async listerAdmin(filtres: FiltresPublicitesAdmin): Promise<{ publicites: PubliciteAvecTotaux[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filtres.statut) {
      params.push(filtres.statut);
      conditions.push(`p.statut = $${params.length}::statut_publicite`);
    } else {
      conditions.push(`p.statut <> 'brouillon'::statut_publicite`);
    }
    if (filtres.type_annonceur) {
      params.push(filtres.type_annonceur);
      conditions.push(`p.type_annonceur = $${params.length}::type_annonceur_publicite`);
    }
    if (filtres.formule) {
      params.push(filtres.formule);
      conditions.push(`p.formule = $${params.length}::formule_publicite`);
    }
    if (filtres.statut_remboursement) {
      params.push(filtres.statut_remboursement);
      conditions.push(`p.statut_remboursement = $${params.length}::statut_remboursement_boost`);
    }
    if (filtres.recherche) {
      params.push(`%${filtres.recherche}%`);
      conditions.push(`(p.annonceur_nom ILIKE $${params.length} OR EXISTS (SELECT 1 FROM boutiques b WHERE b.id = p.boutique_id AND b.nom ILIKE $${params.length}))`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const limite = Math.min(Math.max(filtres.limite ?? 20, 1), 100);
    const offset = (Math.max(filtres.page ?? 1, 1) - 1) * limite;

    const { rows: total } = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM publicites p ${where}`, params);
    const { rows } = await query<PubliciteAvecTotaux>(
      `SELECT ${SELECTION}, json_build_object('affichages', COALESCE(tot.affichages, 0), 'clics', COALESCE(tot.clics, 0)) AS totaux
       FROM publicites p ${JOINTURE_TOTAUX} ${where}
       ORDER BY p.date_modification DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, offset]
    );
    return { publicites: rows, total: Number(total[0].count) };
  }

  static async compterParStatut(): Promise<Record<string, number>> {
    const { rows } = await query<{ statut: string; count: string }>(`SELECT statut, COUNT(*) AS count FROM publicites GROUP BY statut`);
    const resultat: Record<string, number> = {};
    for (const row of rows) resultat[row.statut] = Number(row.count);
    const { rows: remb } = await query<{ count: string; montant: string | null }>(
      `SELECT COUNT(*) AS count, SUM(montant_a_rembourser_fcfa) AS montant FROM publicites WHERE statut_remboursement = 'a_rembourser'`
    );
    resultat.a_rembourser = Number(remb[0].count);
    resultat.montant_a_rembourser_fcfa = Number(remb[0].montant ?? 0);
    const { rows: ca } = await query<{ montant: string | null }>(
      `SELECT SUM(total_fcfa) AS montant FROM publicites
       WHERE statut IN ('programmee', 'active', 'terminee') AND mode_paiement <> 'offert'`
    );
    resultat.chiffre_affaires_fcfa = Number(ca[0].montant ?? 0);
    return resultat;
  }

  static async mettreAJour(id: number, donnees: DonneesPublicite, executeur: Executeur = executeurParDefaut): Promise<Publicite | null> {
    const champs = filtrerColonnes(donnees);
    if (!champs.length) return PubliciteModel.getById(id, executeur);
    const sets = champs.map(([c], i) => `${c} = ${placeholder(c, i + 2)}`);
    const { rows } = await executeur.query<{ id: number }>(
      `UPDATE publicites SET ${sets.join(', ')}, date_modification = NOW() WHERE id = $1 RETURNING id`,
      [id, ...champs.map(([, v]) => v)]
    );
    return rows[0] ? PubliciteModel.getById(id, executeur) : null;
  }

  /**
   * Change le statut uniquement si le statut courant fait partie de `depuis` (verrou optimiste) :
   * renvoie null si un autre traitement a déjà fait la transition (idempotence).
   */
  static async changerStatut(
    id: number,
    depuis: StatutPublicite[],
    vers: StatutPublicite,
    donnees: DonneesPublicite = {},
    executeur: Executeur = executeurParDefaut
  ): Promise<Publicite | null> {
    const champs = filtrerColonnes({ ...donnees, statut: undefined });
    const sets = [`statut = $2::statut_publicite`, ...champs.map(([c], i) => `${c} = ${placeholder(c, i + 4)}`)];
    const { rows } = await executeur.query<{ id: number }>(
      `UPDATE publicites SET ${sets.join(', ')}, date_modification = NOW()
       WHERE id = $1 AND statut = ANY($3::statut_publicite[])
       RETURNING id`,
      [id, vers, depuis, ...champs.map(([, v]) => v)]
    );
    return rows[0] ? PubliciteModel.getById(id, executeur) : null;
  }

  static async supprimerBrouillon(id: number): Promise<boolean> {
    const { rowCount } = await query(`DELETE FROM publicites WHERE id = $1 AND statut = 'brouillon'::statut_publicite`, [id]);
    return (rowCount ?? 0) > 0;
  }

  /** Publicités dont le statut doit avancer à `maintenant` (cron). */
  static async aDemarrer(maintenant: Date): Promise<Publicite[]> {
    const { rows } = await query<Publicite>(
      `SELECT ${SELECTION} FROM publicites p WHERE p.statut = 'programmee' AND p.date_debut <= $1 AND p.date_fin > $1 ORDER BY p.id`,
      [maintenant]
    );
    return rows;
  }

  static async aTerminer(maintenant: Date): Promise<Publicite[]> {
    const { rows } = await query<Publicite>(
      `SELECT ${SELECTION} FROM publicites p WHERE p.statut IN ('programmee', 'active') AND p.date_fin <= $1 ORDER BY p.id`,
      [maintenant]
    );
    return rows;
  }

  /** Publicités dont les semaines sont bloquées par un paiement non abouti depuis plus de `minutes`. */
  static async paiementsExpires(minutes: number): Promise<Publicite[]> {
    const { rows } = await query<Publicite>(
      `SELECT ${SELECTION} FROM publicites p
       WHERE p.statut = 'en_attente_paiement'
         AND p.date_soumission < NOW() - ($1 || ' minutes')::interval
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.publicite_id = p.id AND t.statut = 'en_attente'::statut_paiement
             AND t.date_creation > NOW() - ($1 || ' minutes')::interval
         )
       ORDER BY p.id`,
      [String(minutes)]
    );
    return rows;
  }

  /** Nombre de publicités en attente de validation (badge du back-office). */
  static async compterAValider(): Promise<number> {
    const { rows } = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM publicites WHERE statut = 'en_attente_validation'`);
    return Number(rows[0].count);
  }
}

export interface LignePlanning {
  semaine: string;
  creneau: CreneauPublicite;
  categorie_id: number | null;
  categorie_nom: string | null;
  publicite_id: number;
  statut: StatutPublicite;
  formule: FormulePublicite;
  annonceur_nom: string;
}

export class PubliciteReservationModel {
  /**
   * Réserve les créneaux d'une publicité. L'index unique `uq_publicite_reservation_creneau` garantit
   * l'exclusivité même en cas de soumissions simultanées : un conflit lève ReservationConflitError.
   */
  static async reserver(publiciteId: number, lignes: LigneReservation[], executeur: Executeur): Promise<void> {
    for (const ligne of lignes) {
      try {
        await executeur.query(
          `INSERT INTO publicite_reservations (publicite_id, creneau, categorie_id, semaine)
           VALUES ($1, $2::creneau_publicite, $3, $4::date)`,
          [publiciteId, ligne.creneau, ligne.categorie_id, ligne.semaine]
        );
      } catch (err: any) {
        if (err?.code === '23505') throw new ReservationConflitError();
        throw err;
      }
    }
  }

  /** Libère les réservations d'une publicité (toutes, ou à partir d'une semaine incluse). */
  static async liberer(publiciteId: number, aPartirDe: string | null = null, executeur: Executeur = executeurParDefaut): Promise<number> {
    const { rowCount } = await executeur.query(
      `DELETE FROM publicite_reservations WHERE publicite_id = $1 AND ($2::date IS NULL OR semaine >= $2::date)`,
      [publiciteId, aPartirDe]
    );
    return rowCount ?? 0;
  }

  static async listerSemaines(publiciteId: number): Promise<string[]> {
    const { rows } = await query<{ semaine: string }>(
      `SELECT DISTINCT to_char(semaine, 'YYYY-MM-DD') AS semaine FROM publicite_reservations WHERE publicite_id = $1 ORDER BY 1`,
      [publiciteId]
    );
    return rows.map((r) => r.semaine);
  }

  /** Semaines (parmi `semaines`) où au moins un des créneaux demandés est déjà pris par une autre publicité. */
  static async semainesOccupees(
    creneaux: CreneauPublicite[],
    categorieId: number | null,
    semaines: string[],
    exclurePubliciteId: number | null = null
  ): Promise<Set<string>> {
    if (!semaines.length || !creneaux.length) return new Set();
    const { rows } = await query<{ semaine: string }>(
      `SELECT DISTINCT to_char(semaine, 'YYYY-MM-DD') AS semaine FROM publicite_reservations
       WHERE creneau = ANY($1::creneau_publicite[])
         AND (creneau <> 'categorie' OR categorie_id = $2)
         AND semaine = ANY($3::date[])
         AND ($4::int IS NULL OR publicite_id <> $4)`,
      [creneaux, categorieId, semaines, exclurePubliciteId]
    );
    return new Set(rows.map((r) => r.semaine));
  }

  /** Occupation des créneaux sur une plage de semaines (planning du back-office). */
  static async planning(premiere: string, derniere: string): Promise<LignePlanning[]> {
    const { rows } = await query<LignePlanning>(
      `SELECT to_char(r.semaine, 'YYYY-MM-DD') AS semaine, r.creneau, r.categorie_id, c.nom AS categorie_nom,
              p.id AS publicite_id, p.statut, p.formule, p.annonceur_nom
       FROM publicite_reservations r
       JOIN publicites p ON p.id = r.publicite_id
       LEFT JOIN categories c ON c.id = r.categorie_id
       WHERE r.semaine BETWEEN $1::date AND $2::date
       ORDER BY r.semaine, r.creneau, c.nom`,
      [premiere, derniere]
    );
    return rows;
  }

  /**
   * Bannières à diffuser cette semaine sur les créneaux demandés : publicité validée (programmée ou
   * active) dont la période couvre l'instant présent.
   */
  static async diffusion(
    lundi: string,
    creneaux: Array<{ creneau: CreneauPublicite; categorie_id: number | null }>,
    maintenant: Date
  ): Promise<BannierePubliciteDiffusee[]> {
    if (!creneaux.length) return [];
    const { rows } = await query<BannierePubliciteDiffusee>(
      `SELECT p.id, p.formule, r.creneau, p.type_annonceur, p.image_url, p.image_mobile_url,
              COALESCE(NULLIF(p.texte_alternatif, ''), p.annonceur_nom) AS texte_alternatif, p.annonceur_nom
       FROM publicite_reservations r
       JOIN publicites p ON p.id = r.publicite_id
       JOIN unnest($2::creneau_publicite[], $3::int[]) AS demande(creneau, categorie_id)
         ON demande.creneau = r.creneau AND COALESCE(demande.categorie_id, 0) = COALESCE(r.categorie_id, 0)
       WHERE r.semaine = $1::date
         AND p.statut IN ('programmee', 'active')
         AND p.image_url IS NOT NULL
         AND p.date_debut <= $4 AND p.date_fin > $4`,
      [lundi, creneaux.map((c) => c.creneau), creneaux.map((c) => c.categorie_id), maintenant]
    );
    return rows;
  }
}

export class PubliciteInteractionModel {
  static async enregistrer(publiciteId: number, type: TypeInteractionPublicite, page: PagePublicite, ipHash: string | null): Promise<void> {
    await query(
      `INSERT INTO publicite_interactions (publicite_id, type, page, ip_hash) VALUES ($1, $2::type_interaction_publicite, $3, $4)`,
      [publiciteId, type, page, ipHash]
    );
  }

  static async stats(publiciteId: number): Promise<StatsPublicite> {
    const { rows: totaux } = await query<{ affichages: string; clics: string; visiteurs: string }>(
      `SELECT COUNT(*) FILTER (WHERE type = 'affichage') AS affichages,
              COUNT(*) FILTER (WHERE type = 'clic') AS clics,
              COUNT(DISTINCT ip_hash) FILTER (WHERE type = 'affichage') AS visiteurs
       FROM publicite_interactions WHERE publicite_id = $1`,
      [publiciteId]
    );
    const { rows: parJour } = await query<{ date: string; affichages: string; clics: string }>(
      `SELECT to_char((date_creation AT TIME ZONE 'Africa/Libreville')::date, 'YYYY-MM-DD') AS date,
              COUNT(*) FILTER (WHERE type = 'affichage') AS affichages,
              COUNT(*) FILTER (WHERE type = 'clic') AS clics
       FROM publicite_interactions WHERE publicite_id = $1
       GROUP BY 1 ORDER BY 1`,
      [publiciteId]
    );
    const { rows: parPage } = await query<{ page: PagePublicite; affichages: string; clics: string }>(
      `SELECT page, COUNT(*) FILTER (WHERE type = 'affichage') AS affichages, COUNT(*) FILTER (WHERE type = 'clic') AS clics
       FROM publicite_interactions WHERE publicite_id = $1
       GROUP BY page ORDER BY 2 DESC`,
      [publiciteId]
    );
    const affichages = Number(totaux[0].affichages);
    const clics = Number(totaux[0].clics);
    return {
      affichages,
      visiteurs_uniques: Number(totaux[0].visiteurs),
      clics,
      taux_clic: affichages ? Math.round((clics / affichages) * 10_000) / 100 : 0,
      par_jour: parJour.map((r) => ({ date: r.date, affichages: Number(r.affichages), clics: Number(r.clics) })),
      par_page: parPage.map((r) => ({ page: r.page, affichages: Number(r.affichages), clics: Number(r.clics) }))
    };
  }

  /** Vrai si cette IP a déjà été comptée pour ce type dans la dernière minute (anti-rafale). */
  static async recent(publiciteId: number, type: TypeInteractionPublicite, ipHash: string, secondes = 60): Promise<boolean> {
    const { rows } = await query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM publicite_interactions
         WHERE publicite_id = $1 AND type = $2::type_interaction_publicite AND ip_hash = $3
           AND date_creation > NOW() - ($4 || ' seconds')::interval
       ) AS existe`,
      [publiciteId, type, ipHash, String(secondes)]
    );
    return rows[0]?.existe === true;
  }

  static async nettoyer(jours = 180): Promise<number> {
    const { rowCount } = await query(
      `DELETE FROM publicite_interactions WHERE date_creation < NOW() - ($1 || ' days')::interval`,
      [String(jours)]
    );
    return rowCount ?? 0;
  }
}

export class PubliciteEvenementModel {
  static async creer(
    publiciteId: number,
    typeEvenement: string,
    acteur: PubliciteEvenement['acteur'] = 'systeme',
    donnees: Record<string, unknown> | null = null,
    executeur: Executeur = executeurParDefaut
  ): Promise<void> {
    await executeur.query(
      `INSERT INTO publicite_evenements (publicite_id, type_evenement, acteur, donnees) VALUES ($1, $2, $3, $4::jsonb)`,
      [publiciteId, typeEvenement, acteur, donnees ? JSON.stringify(donnees) : null]
    );
  }

  static async lister(publiciteId: number): Promise<PubliciteEvenement[]> {
    const { rows } = await query<PubliciteEvenement>(
      `SELECT * FROM publicite_evenements WHERE publicite_id = $1 ORDER BY date_creation DESC, id DESC`,
      [publiciteId]
    );
    return rows;
  }

  /** Vrai si cette transaction a déjà produit un événement de confirmation ou de remboursement. */
  static async paiementDejaTraite(publiciteId: number, transactionId: number): Promise<boolean> {
    const { rows } = await query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM publicite_evenements
         WHERE publicite_id = $1
           AND type_evenement IN ('paiement_confirme', 'paiement_a_rembourser')
           AND donnees->>'transaction_id' = $2
       ) AS existe`,
      [publiciteId, String(transactionId)]
    );
    return rows[0]?.existe === true;
  }

  /**
   * Ajoute le montant au remboursement et journalise la transaction, une seule fois.
   * L'insert conditionnel et la mise à jour partagent la même requête (pas de double crédit).
   */
  static async crediterRemboursementPaiement(publiciteId: number, transactionId: number, montant: number, note: string): Promise<boolean> {
    const { rows } = await query<{ id: number }>(
      `WITH ins AS (
         INSERT INTO publicite_evenements (publicite_id, type_evenement, acteur, donnees)
         SELECT $1, 'paiement_a_rembourser', 'systeme', $2::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM publicite_evenements
           WHERE publicite_id = $1
             AND type_evenement IN ('paiement_confirme', 'paiement_a_rembourser')
             AND donnees->>'transaction_id' = $3
         )
         RETURNING id
       )
       UPDATE publicites SET
         statut_remboursement = 'a_rembourser'::statut_remboursement_boost,
         montant_a_rembourser_fcfa = montant_a_rembourser_fcfa + $4,
         note_remboursement = $5,
         date_modification = NOW()
       WHERE id = $1 AND EXISTS (SELECT 1 FROM ins)
       RETURNING id`,
      [publiciteId, JSON.stringify({ transaction_id: transactionId, montant, note }), String(transactionId), montant, note]
    );
    return rows.length > 0;
  }
}

/** Valeurs de repli si la table n'a pas été initialisée (identiques à la migration 032). */
export const PARAMETRES_PUBLICITE_DEFAUT: PubliciteParametres = {
  tarifs: { categorie: 1500, accueil: 3000, premium: 6000 },
  remise_4_pour_3: true,
  semaines_max: 12,
  semaines_avance_max: 12,
  garantie_affichages: { categorie: 30, accueil: 100, premium: 200 },
  eligibilite: 'verifiees',
  frais_encaissement_bps: 250,
  delai_paiement_minutes: 120,
  plateforme_active: false,
  kill_switch: false
};

const CLES_BOOLEENNES = new Set(['remise_4_pour_3', 'plateforme_active', 'kill_switch']);
const CLES_PAR_FORMULE = new Set(['tarifs', 'garantie_affichages']);

function parserParFormule(valeur: string, defaut: Record<FormulePublicite, number>): Record<FormulePublicite, number> {
  try {
    const objet = JSON.parse(valeur) as Record<string, unknown>;
    const resultat = { ...defaut };
    for (const formule of Object.keys(defaut) as FormulePublicite[]) {
      const n = Number(objet?.[formule]);
      if (Number.isInteger(n) && n >= 0) resultat[formule] = n;
    }
    return resultat;
  } catch {
    return { ...defaut };
  }
}

/** Convertit les lignes clé/valeur en paramètres typés (valeurs invalides → défaut). */
export function parserParametresPublicite(lignes: Array<{ cle: string; valeur: string }>): PubliciteParametres {
  const parametres: PubliciteParametres = {
    ...PARAMETRES_PUBLICITE_DEFAUT,
    tarifs: { ...PARAMETRES_PUBLICITE_DEFAUT.tarifs },
    garantie_affichages: { ...PARAMETRES_PUBLICITE_DEFAUT.garantie_affichages }
  };
  for (const { cle, valeur } of lignes) {
    if (CLES_BOOLEENNES.has(cle)) {
      (parametres as unknown as Record<string, boolean>)[cle] = valeur === 'true';
    } else if (CLES_PAR_FORMULE.has(cle)) {
      const k = cle as 'tarifs' | 'garantie_affichages';
      parametres[k] = parserParFormule(valeur, PARAMETRES_PUBLICITE_DEFAUT[k]);
    } else if (cle === 'eligibilite') {
      parametres.eligibilite = valeur === 'toutes' ? 'toutes' : 'verifiees';
    } else if (cle in parametres) {
      const n = Number(valeur);
      if (Number.isFinite(n)) (parametres as unknown as Record<string, number>)[cle] = n;
    }
  }
  return parametres;
}

export function serialiserParametresPublicite(parametres: Partial<PubliciteParametres>): Array<[string, string]> {
  return Object.entries(parametres)
    .filter(([cle, valeur]) => cle in PARAMETRES_PUBLICITE_DEFAUT && valeur !== undefined)
    .map(([cle, valeur]) => [cle, CLES_PAR_FORMULE.has(cle) ? JSON.stringify(valeur) : String(valeur)]);
}

export class PubliciteParametresModel {
  static async lire(): Promise<PubliciteParametres> {
    const { rows } = await query<{ cle: string; valeur: string }>(`SELECT cle, valeur FROM publicite_parametres`);
    return parserParametresPublicite(rows);
  }

  static async ecrire(parametres: Partial<PubliciteParametres>): Promise<PubliciteParametres> {
    const entrees = serialiserParametresPublicite(parametres);
    await withTransaction(async (client) => {
      for (const [cle, valeur] of entrees) {
        await client.query(
          `INSERT INTO publicite_parametres (cle, valeur, date_modification) VALUES ($1, $2, NOW())
           ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, date_modification = NOW()`,
          [cle, valeur]
        );
      }
    });
    return PubliciteParametresModel.lire();
  }
}

export class PubliciteTransactionModel {
  static async creer(
    publiciteId: number,
    donnees: { reference_transaction: string; montant: number; methode_paiement: string; numero_telephone?: string | null; reference_operateur?: string | null; description: string }
  ): Promise<Transaction> {
    const { rows } = await query<Transaction>(
      `INSERT INTO transactions (publicite_id, reference_transaction, montant, methode_paiement, statut, type_paiement,
                                 numero_telephone, reference_operateur, description, date_creation, date_modification)
       VALUES ($1, $2, $3, $4::methode_paiement, 'en_attente'::statut_paiement, 'publicite', $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        publiciteId,
        donnees.reference_transaction,
        donnees.montant,
        donnees.methode_paiement,
        donnees.numero_telephone ?? null,
        donnees.reference_operateur ?? null,
        donnees.description
      ]
    );
    return rows[0];
  }

  static async compterPayees(publiciteId: number): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM transactions WHERE publicite_id = $1 AND statut = 'paye'::statut_paiement`,
      [publiciteId]
    );
    return Number(rows[0].count);
  }
}
