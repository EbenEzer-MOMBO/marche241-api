import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import {
  Boost,
  BoostEvenement,
  BoostInsightJour,
  BoostParametres,
  PackBoost,
  StatutBoost,
  StatutRemboursementBoost,
  Transaction
} from '../lib/database-types';

/**
 * Accès SQL du boost publicitaire Meta (tables boosts, boost_insights_jour, boost_evenements,
 * boost_parametres, et transactions de type 'boost').
 */

export type BoostListeVendeur = Boost & {
  produit_nom: string | null;
  totaux: { impressions: number; clics: number; messages: number };
};

/** Colonnes modifiables via `mettreAJour` / `creer` (noms interpolés : liste blanche obligatoire). */
const COLONNES_AUTORISEES = [
  'type_cible',
  'produit_id',
  'objectif',
  'statut',
  'nom',
  'budget_media_fcfa',
  'commission_bps',
  'commission_fcfa',
  'tva_fcfa',
  'frais_encaissement_fcfa',
  'total_fcfa',
  'depense_fcfa',
  'duree_jours',
  'date_debut',
  'date_fin',
  'ciblage',
  'url_destination',
  'whatsapp_e164',
  'titre',
  'texte_principal',
  'description',
  'image_url',
  'cta',
  'note_revue',
  'conformite',
  'valide_par',
  'date_validation',
  'meta_campaign_id',
  'meta_adset_id',
  'meta_ad_id',
  'meta_statut_effectif',
  'meta_derniere_erreur',
  'dry_run',
  'date_derniere_synchro',
  'statut_remboursement',
  'montant_a_rembourser_fcfa',
  'date_remboursement',
  'note_remboursement',
  'date_soumission',
  'date_paiement',
  'date_cloture'
] as const;

export type ColonneBoost = (typeof COLONNES_AUTORISEES)[number];
export type DonneesBoost = Partial<Record<ColonneBoost, unknown>>;

const COLONNES_ENUM: Record<string, string> = {
  statut: 'statut_boost',
  objectif: 'objectif_boost',
  type_cible: 'type_cible_boost',
  statut_remboursement: 'statut_remboursement_boost'
};

const COLONNES_JSON = new Set(['ciblage', 'conformite']);

const filtrerColonnes = (donnees: DonneesBoost): Array<[string, unknown]> =>
  Object.entries(donnees).filter(
    ([colonne, valeur]) => (COLONNES_AUTORISEES as readonly string[]).includes(colonne) && valeur !== undefined
  );

const placeholder = (colonne: string, position: number): string => {
  if (COLONNES_ENUM[colonne]) return `$${position}::${COLONNES_ENUM[colonne]}`;
  if (COLONNES_JSON.has(colonne)) return `$${position}::jsonb`;
  return `$${position}`;
};

const valeurSql = (colonne: string, valeur: unknown): unknown =>
  COLONNES_JSON.has(colonne) && valeur !== null ? JSON.stringify(valeur) : valeur;

const JOINTURE_BOUTIQUE = `(SELECT json_build_object('id', b.id, 'nom', b.nom, 'slug', b.slug, 'logo', b.logo)
   FROM boutiques b WHERE b.id = bo.boutique_id) AS boutique`;

type Executeur = Pick<PoolClient, 'query'>;
const executeurParDefaut: Executeur = { query: ((text: string, params?: unknown[]) => query(text, params)) as PoolClient['query'] };

export interface FiltresBoostsAdmin {
  statut?: StatutBoost;
  statut_remboursement?: StatutRemboursementBoost;
  boutique_id?: number;
  recherche?: string;
  page?: number;
  limite?: number;
}

export class BoostModel {
  static async creer(donnees: DonneesBoost & { boutique_id: number; vendeur_id: number; nom: string }): Promise<Boost> {
    const champs = filtrerColonnes(donnees);
    const colonnes = ['boutique_id', 'vendeur_id', ...champs.map(([c]) => c)];
    const valeurs = [donnees.boutique_id, donnees.vendeur_id, ...champs.map(([c, v]) => valeurSql(c, v))];
    const placeholders = ['$1', '$2', ...champs.map(([c], i) => placeholder(c, i + 3))];
    const { rows } = await query<Boost>(
      `INSERT INTO boosts (${colonnes.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valeurs
    );
    return rows[0];
  }

  static async getById(id: number): Promise<Boost | null> {
    const { rows } = await query<Boost>(`SELECT bo.*, ${JOINTURE_BOUTIQUE} FROM boosts bo WHERE bo.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Liste vendeur : chaque boost avec le nom du produit promu et ses totaux de diffusion. */
  static async listerParBoutique(boutiqueId: number): Promise<BoostListeVendeur[]> {
    const { rows } = await query<BoostListeVendeur>(
      `SELECT bo.*, pr.nom AS produit_nom,
              json_build_object(
                'impressions', COALESCE(st.impressions, 0),
                'clics', COALESCE(st.clics, 0),
                'messages', COALESCE(st.messages, 0)
              ) AS totaux
       FROM boosts bo
       LEFT JOIN produits pr ON pr.id = bo.produit_id
       LEFT JOIN LATERAL (
         SELECT SUM(impressions)::int AS impressions, SUM(clics)::int AS clics, SUM(messages)::int AS messages
         FROM boost_insights_jour WHERE boost_id = bo.id
       ) st ON TRUE
       WHERE bo.boutique_id = $1
       ORDER BY bo.date_modification DESC`,
      [boutiqueId]
    );
    return rows;
  }

  static async listerAdmin(filtres: FiltresBoostsAdmin): Promise<{ boosts: Boost[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filtres.statut) {
      params.push(filtres.statut);
      conditions.push(`bo.statut = $${params.length}::statut_boost`);
    } else {
      conditions.push(`bo.statut <> 'brouillon'::statut_boost`);
    }
    if (filtres.statut_remboursement) {
      params.push(filtres.statut_remboursement);
      conditions.push(`bo.statut_remboursement = $${params.length}::statut_remboursement_boost`);
    }
    if (filtres.boutique_id) {
      params.push(filtres.boutique_id);
      conditions.push(`bo.boutique_id = $${params.length}`);
    }
    if (filtres.recherche) {
      params.push(`%${filtres.recherche}%`);
      conditions.push(`(bo.nom ILIKE $${params.length} OR EXISTS (SELECT 1 FROM boutiques b WHERE b.id = bo.boutique_id AND b.nom ILIKE $${params.length}))`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limite = Math.min(Math.max(filtres.limite ?? 20, 1), 100);
    const offset = (Math.max(filtres.page ?? 1, 1) - 1) * limite;

    const { rows: total } = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM boosts bo ${where}`, params);
    const { rows } = await query<Boost>(
      `SELECT bo.*, ${JOINTURE_BOUTIQUE} FROM boosts bo ${where}
       ORDER BY bo.date_modification DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, offset]
    );
    return { boosts: rows, total: Number(total[0].count) };
  }

  static async compterParStatut(): Promise<Record<string, number>> {
    const { rows } = await query<{ statut: string; count: string }>(
      `SELECT statut, COUNT(*) AS count FROM boosts GROUP BY statut`
    );
    const resultat: Record<string, number> = {};
    for (const row of rows) resultat[row.statut] = Number(row.count);
    const { rows: remb } = await query<{ count: string; montant: string | null }>(
      `SELECT COUNT(*) AS count, SUM(montant_a_rembourser_fcfa) AS montant FROM boosts WHERE statut_remboursement = 'a_rembourser'`
    );
    resultat.a_rembourser = Number(remb[0].count);
    resultat.montant_a_rembourser_fcfa = Number(remb[0].montant ?? 0);
    return resultat;
  }

  static async listerEnDiffusion(): Promise<Boost[]> {
    const { rows } = await query<Boost>(
      `SELECT * FROM boosts WHERE statut IN ('actif', 'en_pause') AND meta_campaign_id IS NOT NULL ORDER BY id`
    );
    return rows;
  }

  static async mettreAJour(id: number, donnees: DonneesBoost, executeur: Executeur = executeurParDefaut): Promise<Boost | null> {
    const champs = filtrerColonnes(donnees);
    if (!champs.length) return BoostModel.getById(id);
    const sets = champs.map(([c], i) => `${c} = ${placeholder(c, i + 2)}`);
    const { rows } = await executeur.query<Boost>(
      `UPDATE boosts SET ${sets.join(', ')}, date_modification = NOW() WHERE id = $1 RETURNING *`,
      [id, ...champs.map(([c, v]) => valeurSql(c, v))]
    );
    return rows[0] ?? null;
  }

  /**
   * Change le statut uniquement si le statut courant fait partie de `depuis` (verrou optimiste) :
   * renvoie null si un autre traitement a déjà fait la transition (idempotence).
   */
  static async changerStatut(
    id: number,
    depuis: StatutBoost[],
    vers: StatutBoost,
    donnees: DonneesBoost = {},
    executeur: Executeur = executeurParDefaut
  ): Promise<Boost | null> {
    const champs = filtrerColonnes({ ...donnees, statut: undefined });
    const sets = [`statut = $2::statut_boost`, ...champs.map(([c], i) => `${c} = ${placeholder(c, i + 4)}`)];
    const { rows } = await executeur.query<Boost>(
      `UPDATE boosts SET ${sets.join(', ')}, date_modification = NOW()
       WHERE id = $1 AND statut = ANY($3::statut_boost[])
       RETURNING *`,
      [id, vers, depuis, ...champs.map(([c, v]) => valeurSql(c, v))]
    );
    return rows[0] ?? null;
  }

  static async supprimerBrouillon(id: number): Promise<boolean> {
    const { rowCount } = await query(`DELETE FROM boosts WHERE id = $1 AND statut = 'brouillon'::statut_boost`, [id]);
    return (rowCount ?? 0) > 0;
  }
}

export class BoostEvenementModel {
  static async creer(
    boostId: number,
    typeEvenement: string,
    acteur: BoostEvenement['acteur'] = 'systeme',
    donnees: Record<string, unknown> | null = null,
    executeur: Executeur = executeurParDefaut
  ): Promise<void> {
    await executeur.query(
      `INSERT INTO boost_evenements (boost_id, type_evenement, acteur, donnees) VALUES ($1, $2, $3, $4::jsonb)`,
      [boostId, typeEvenement, acteur, donnees ? JSON.stringify(donnees) : null]
    );
  }

  /**
   * Ajoute le montant au remboursement et journalise la transaction, une seule fois.
   * L'insert conditionnel et la mise à jour partagent la même requête (pas de double crédit).
   */
  static async crediterRemboursementPaiement(
    boostId: number,
    transactionId: number,
    montant: number,
    type: 'paiement_en_double' | 'paiement_hors_file',
    note: string,
    statut: string
  ): Promise<boolean> {
    const { rows } = await query<{ id: number }>(
      `WITH ins AS (
         INSERT INTO boost_evenements (boost_id, type_evenement, acteur, donnees)
         SELECT $1, $2, 'systeme', $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM boost_evenements
           WHERE boost_id = $1
             AND type_evenement IN ('paiement_confirme', 'paiement_en_double', 'paiement_hors_file')
             AND donnees->>'transaction_id' = $4
         )
         RETURNING id
       )
       UPDATE boosts SET
         statut_remboursement = 'a_rembourser'::statut_remboursement_boost,
         montant_a_rembourser_fcfa = montant_a_rembourser_fcfa + $5,
         note_remboursement = $6,
         date_modification = NOW()
       WHERE id = $1 AND EXISTS (SELECT 1 FROM ins)
       RETURNING id`,
      [boostId, type, JSON.stringify({ transaction_id: transactionId, montant, statut }), String(transactionId), montant, note]
    );
    return rows.length > 0;
  }

  /** Vrai si cette transaction a déjà produit un événement de confirmation ou de remboursement. */
  static async paiementDejaTraite(boostId: number, transactionId: number): Promise<boolean> {
    const { rows } = await query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM boost_evenements
         WHERE boost_id = $1
           AND type_evenement IN ('paiement_confirme', 'paiement_en_double', 'paiement_hors_file')
           AND donnees->>'transaction_id' = $2
       ) AS existe`,
      [boostId, String(transactionId)]
    );
    return rows[0]?.existe === true;
  }

  static async lister(boostId: number): Promise<BoostEvenement[]> {
    const { rows } = await query<BoostEvenement>(
      `SELECT * FROM boost_evenements WHERE boost_id = $1 ORDER BY date_creation DESC, id DESC`,
      [boostId]
    );
    return rows;
  }
}

export interface LigneInsightBoost {
  date: string;
  depense_fcfa: number;
  depense_devise: number;
  impressions: number;
  portee: number;
  clics: number;
  messages: number;
  brut?: unknown;
}

export class BoostInsightModel {
  static async upsert(boostId: number, ligne: LigneInsightBoost): Promise<void> {
    await query(
      `INSERT INTO boost_insights_jour (boost_id, date, depense_fcfa, depense_devise, impressions, portee, clics, messages, brut, date_maj)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
       ON CONFLICT (boost_id, date) DO UPDATE SET
         depense_fcfa = EXCLUDED.depense_fcfa,
         depense_devise = EXCLUDED.depense_devise,
         impressions = EXCLUDED.impressions,
         portee = EXCLUDED.portee,
         clics = EXCLUDED.clics,
         messages = EXCLUDED.messages,
         brut = EXCLUDED.brut,
         date_maj = NOW()`,
      [
        boostId,
        ligne.date,
        ligne.depense_fcfa,
        ligne.depense_devise,
        ligne.impressions,
        ligne.portee,
        ligne.clics,
        ligne.messages,
        ligne.brut === undefined ? null : JSON.stringify(ligne.brut)
      ]
    );
  }

  static async lister(boostId: number): Promise<BoostInsightJour[]> {
    const { rows } = await query<BoostInsightJour>(
      `SELECT id, boost_id, to_char(date, 'YYYY-MM-DD') AS date, depense_fcfa, depense_devise::float AS depense_devise,
              impressions, portee, clics, messages, date_maj
       FROM boost_insights_jour WHERE boost_id = $1 ORDER BY date`,
      [boostId]
    );
    return rows;
  }

  static async totaux(boostId: number): Promise<{ depense_fcfa: number; impressions: number; portee: number; clics: number; messages: number }> {
    const { rows } = await query<Record<string, string | null>>(
      `SELECT COALESCE(SUM(depense_fcfa), 0) AS depense_fcfa, COALESCE(SUM(impressions), 0) AS impressions,
              COALESCE(SUM(portee), 0) AS portee, COALESCE(SUM(clics), 0) AS clics, COALESCE(SUM(messages), 0) AS messages
       FROM boost_insights_jour WHERE boost_id = $1`,
      [boostId]
    );
    const r = rows[0];
    return {
      depense_fcfa: Number(r.depense_fcfa),
      impressions: Number(r.impressions),
      portee: Number(r.portee),
      clics: Number(r.clics),
      messages: Number(r.messages)
    };
  }
}

/** Valeurs de repli si la table n'a pas été initialisée (identiques à la migration 026). */
export const PARAMETRES_BOOST_DEFAUT: BoostParametres = {
  commission_bps: 2500,
  commission_min_fcfa: 1000,
  tva_bps: 0,
  frais_encaissement_bps: 250,
  total_min_fcfa: 3000,
  total_max_fcfa: 500_000,
  duree_min_jours: 3,
  duree_max_jours: 14,
  packs: [
    { code: 'decouverte', nom: 'Découverte', total_fcfa: 3000, duree_jours: 3 },
    { code: 'standard', nom: 'Standard', total_fcfa: 7500, duree_jours: 5 },
    { code: 'pro', nom: 'Boost Pro', total_fcfa: 15_000, duree_jours: 7 },
    { code: 'max', nom: 'Boost Max', total_fcfa: 30_000, duree_jours: 10 }
  ],
  fx_xaf_par_usd: 600,
  cpm_min_fcfa: 46,
  cpm_max_fcfa: 85,
  budget_jour_min_fcfa: 600,
  kill_switch: false
};

/** Convertit les lignes clé/valeur en paramètres typés (valeurs invalides → défaut). */
export function parserParametres(lignes: Array<{ cle: string; valeur: string }>): BoostParametres {
  const parametres: BoostParametres = { ...PARAMETRES_BOOST_DEFAUT, packs: [...PARAMETRES_BOOST_DEFAUT.packs] };
  for (const { cle, valeur } of lignes) {
    if (cle === 'kill_switch') {
      parametres.kill_switch = valeur === 'true';
    } else if (cle === 'packs') {
      try {
        const packs = JSON.parse(valeur) as PackBoost[];
        if (Array.isArray(packs)) {
          parametres.packs = packs.filter(
            (p) => p && typeof p.code === 'string' && Number.isInteger(p.total_fcfa) && Number.isInteger(p.duree_jours)
          );
        }
      } catch {
        // valeur corrompue : on garde les packs par défaut
      }
    } else if (cle in parametres) {
      const n = Number(valeur);
      if (Number.isFinite(n)) (parametres as unknown as Record<string, number>)[cle] = n;
    }
  }
  return parametres;
}

export function serialiserParametres(parametres: Partial<BoostParametres>): Array<[string, string]> {
  return Object.entries(parametres)
    .filter(([cle, valeur]) => cle in PARAMETRES_BOOST_DEFAUT && valeur !== undefined)
    .map(([cle, valeur]) => [cle, cle === 'packs' ? JSON.stringify(valeur) : String(valeur)]);
}

export class BoostParametresModel {
  static async lire(): Promise<BoostParametres> {
    const { rows } = await query<{ cle: string; valeur: string }>(`SELECT cle, valeur FROM boost_parametres`);
    return parserParametres(rows);
  }

  static async ecrire(parametres: Partial<BoostParametres>): Promise<BoostParametres> {
    const entrees = serialiserParametres(parametres);
    await withTransaction(async (client) => {
      for (const [cle, valeur] of entrees) {
        await client.query(
          `INSERT INTO boost_parametres (cle, valeur, date_modification) VALUES ($1, $2, NOW())
           ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, date_modification = NOW()`,
          [cle, valeur]
        );
      }
    });
    return BoostParametresModel.lire();
  }
}

export class BoostTransactionModel {
  static async creer(
    boostId: number,
    donnees: { reference_transaction: string; montant: number; methode_paiement: string; numero_telephone?: string | null; reference_operateur?: string | null; description: string }
  ): Promise<Transaction> {
    const { rows } = await query<Transaction>(
      `INSERT INTO transactions (boost_id, reference_transaction, montant, methode_paiement, statut, type_paiement,
                                 numero_telephone, reference_operateur, description, date_creation, date_modification)
       VALUES ($1, $2, $3, $4::methode_paiement, 'en_attente'::statut_paiement, 'boost', $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        boostId,
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

  static async lister(boostId: number): Promise<Transaction[]> {
    const { rows } = await query<Transaction>(
      `SELECT * FROM transactions WHERE boost_id = $1 ORDER BY date_creation DESC`,
      [boostId]
    );
    return rows;
  }

  static async compterPayees(boostId: number): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM transactions WHERE boost_id = $1 AND statut = 'paye'::statut_paiement`,
      [boostId]
    );
    return Number(rows[0].count);
  }
}
