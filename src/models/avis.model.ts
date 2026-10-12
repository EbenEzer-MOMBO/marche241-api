import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import {
  AvisDetaille,
  AvisParametres,
  AvisPublic,
  InvitationAvisPublique,
  ProduitANoter,
  ResumeAvisProduit,
  StatsAvis,
  StatutAvis
} from '../lib/database-types';
import { nomAuteurAvis, prenomClient } from '../lib/avis/auteur';
import { genererJetonAvis } from '../lib/avis/jeton';
import { parserParametresAvis, serialiserParametresAvis } from '../lib/avis/parametres';

/**
 * Accès SQL des avis produits vérifiés (tables avis_produits, avis_invitations, avis_parametres).
 * Les agrégats note_moyenne / nombre_avis (produits + boutiques) sont recalculés par la fonction SQL
 * recalculer_note_avis (migration 038) à chaque changement de statut.
 */

/** Un produit est un événement si variants.type = 'evenement' ou s'il est dans la catégorie « Événements ». */
const CONDITION_EVENEMENT = `(COALESCE(p.variants->>'type', '') = 'evenement'
  OR EXISTS (SELECT 1 FROM categories ce WHERE ce.id = p.categorie_id AND ce.slug = 'evenements'))`;

/** Image d'un produit : image principale, sinon première image de la galerie. */
const IMAGE_PRODUIT = `COALESCE(NULLIF(p.image_principale, ''),
  CASE WHEN json_typeof(p.images) = 'array' THEN p.images->>0 END)`;

/** Avis signalés restant à trancher (même définition pour le filtre et le compteur). */
const CONDITION_SIGNALE = `((a.statut = 'en_attente' AND (a.signale_auto OR a.signale_par_vendeur))
  OR (a.statut = 'approuve' AND a.signale_par_vendeur))`;

/** Fenêtre de rattrapage : on n'invite pas les commandes livrées depuis plus longtemps (activation tardive). */
const RATTRAPAGE_MAX_JOURS = 21;

export interface CommandeAInviter {
  commande_id: number;
  numero_commande: string;
  client_nom: string;
  client_telephone: string;
  boutique_nom: string;
}

export interface InvitationCreee extends CommandeAInviter {
  invitation_id: number;
  jeton: string;
}

export interface AvisSoumis {
  produit_id: number;
  note: number;
  commentaire: string | null;
  signale_auto: boolean;
  motifs_auto: string[];
  statut: 'en_attente' | 'approuve';
}

export interface ResultatSoumission {
  crees: Array<{ id: number; produit_id: number; note: number; statut: StatutAvis; signale_auto: boolean }>;
  ignores: number[]; // produits déjà notés ou absents de la commande
  terminee: boolean;
}

export interface FiltresAvis {
  statut?: StatutAvis;
  signales?: boolean;
  boutique_id?: number;
  produit_id?: number;
  note?: number;
  sans_reponse?: boolean;
  recherche?: string;
  page?: number;
  limite?: number;
}

interface LigneAvisDetaille {
  id: number;
  produit_id: number;
  produit_nom: string;
  produit_image: string | null;
  boutique_id: number;
  boutique_nom: string;
  commande_id: number | null;
  numero_commande: string | null;
  nom_client: string;
  telephone_client: string | null;
  note: number;
  commentaire: string | null;
  statut: StatutAvis;
  reponse_vendeur: string | null;
  date_reponse_vendeur: Date | null;
  signale_auto: boolean;
  motifs_auto: string[];
  signale_par_vendeur: boolean;
  motif_signalement: string | null;
  motif_rejet: string | null;
  modere_par: string | null;
  date_creation: Date;
  date_moderation: Date | null;
}

const SELECT_DETAILLE = `
  SELECT a.id, a.produit_id, p.nom AS produit_nom, ${IMAGE_PRODUIT} AS produit_image,
         b.id AS boutique_id, b.nom AS boutique_nom, a.commande_id, c.numero_commande,
         a.nom_client, a.telephone_client, a.note, a.commentaire, a.statut, a.reponse_vendeur, a.date_reponse_vendeur,
         a.signale_auto, a.motifs_auto, a.signale_par_vendeur, a.motif_signalement, a.motif_rejet, a.modere_par,
         a.date_creation, a.date_moderation
  FROM avis_produits a
  JOIN produits p ON p.id = a.produit_id
  JOIN boutiques b ON b.id = p.boutique_id
  LEFT JOIN commandes c ON c.id = a.commande_id`;

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function versDetaille(l: LigneAvisDetaille, pourAdmin: boolean): AvisDetaille {
  const avis: AvisDetaille = {
    id: l.id,
    produit_id: l.produit_id,
    produit_nom: l.produit_nom,
    produit_image: l.produit_image,
    boutique_id: l.boutique_id,
    boutique_nom: l.boutique_nom,
    commande_id: l.commande_id,
    numero_commande: l.numero_commande,
    auteur: nomAuteurAvis(l.nom_client),
    note: l.note,
    commentaire: l.commentaire,
    statut: l.statut,
    reponse_vendeur: l.reponse_vendeur,
    date_reponse_vendeur: iso(l.date_reponse_vendeur),
    signale_auto: l.signale_auto,
    motifs_auto: l.motifs_auto ?? [],
    signale_par_vendeur: l.signale_par_vendeur,
    motif_signalement: l.motif_signalement,
    motif_rejet: l.motif_rejet,
    modere_par: pourAdmin ? l.modere_par : null,
    date_creation: iso(l.date_creation) as string,
    date_moderation: iso(l.date_moderation)
  };
  if (pourAdmin) {
    avis.nom_client = l.nom_client;
    avis.telephone_client = l.telephone_client;
  }
  return avis;
}

/** Construit le WHERE commun des listes vendeur / admin. */
function construireFiltres(filtres: FiltresAvis, params: unknown[], conditions: string[]): void {
  if (filtres.statut) {
    params.push(filtres.statut);
    conditions.push(`a.statut = $${params.length}::statut_avis`);
  }
  // Signalés = à trancher : en attente et marqués (filtre auto ou vendeur), ou publiés puis signalés par le vendeur
  if (filtres.signales) conditions.push(CONDITION_SIGNALE);
  if (filtres.boutique_id) {
    params.push(filtres.boutique_id);
    conditions.push(`b.id = $${params.length}`);
  }
  if (filtres.produit_id) {
    params.push(filtres.produit_id);
    conditions.push(`a.produit_id = $${params.length}`);
  }
  if (filtres.note) {
    params.push(filtres.note);
    conditions.push(`a.note = $${params.length}`);
  }
  if (filtres.sans_reponse) conditions.push(`a.statut = 'approuve' AND a.reponse_vendeur IS NULL`);
  if (filtres.recherche) {
    params.push(`%${filtres.recherche.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    const i = params.length;
    conditions.push(`(a.commentaire ILIKE $${i} OR p.nom ILIKE $${i} OR b.nom ILIKE $${i} OR c.numero_commande ILIKE $${i})`);
  }
}

async function recalculer(client: PoolClient, produitId: number): Promise<void> {
  await client.query('SELECT recalculer_note_avis($1)', [produitId]);
}

export class AvisParametresModel {
  static async lire(): Promise<AvisParametres> {
    const { rows } = await query<{ cle: string; valeur: string }>('SELECT cle, valeur FROM avis_parametres');
    return parserParametresAvis(rows);
  }

  static async ecrire(parametres: Partial<AvisParametres>): Promise<AvisParametres> {
    const entrees = serialiserParametresAvis(parametres);
    await withTransaction(async (client) => {
      for (const [cle, valeur] of entrees) {
        await client.query(
          `INSERT INTO avis_parametres (cle, valeur, date_modification) VALUES ($1, $2, NOW())
           ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, date_modification = NOW()`,
          [cle, valeur]
        );
      }
    });
    return AvisParametresModel.lire();
  }
}

export class AvisInvitationModel {
  /**
   * Commandes livrées depuis au moins `delaiJours` (et au plus RATTRAPAGE_MAX_JOURS de plus),
   * sans invitation, boutique active, avec au moins un article qui n'est pas un billet d'événement.
   */
  static async commandesAInviter(delaiJours: number, limite: number): Promise<CommandeAInviter[]> {
    const { rows } = await query<CommandeAInviter>(
      `SELECT c.id AS commande_id, c.numero_commande, c.client_nom, c.client_telephone, b.nom AS boutique_nom
       FROM commandes c
       JOIN boutiques b ON b.id = c.boutique_id
       WHERE c.statut = 'livree'
         AND c.date_livraison IS NOT NULL
         AND c.date_livraison <= LOCALTIMESTAMP - make_interval(days => $1)
         AND c.date_livraison >= LOCALTIMESTAMP - make_interval(days => $1 + $2)
         AND b.statut = 'active'
         AND NULLIF(TRIM(c.client_telephone), '') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM avis_invitations i WHERE i.commande_id = c.id)
         AND EXISTS (
           SELECT 1 FROM commande_articles ca JOIN produits p ON p.id = ca.produit_id
           WHERE ca.commande_id = c.id AND NOT ${CONDITION_EVENEMENT}
         )
       ORDER BY c.date_livraison
       LIMIT $3`,
      [delaiJours, RATTRAPAGE_MAX_JOURS, limite]
    );
    return rows;
  }

  /** Crée l'invitation (une seule par commande) et renvoie le jeton en clair, une seule fois. */
  static async creer(commande: CommandeAInviter, validiteJours: number): Promise<InvitationCreee | null> {
    const { jeton, hash } = genererJetonAvis();
    const { rows } = await query<{ id: number }>(
      `INSERT INTO avis_invitations (commande_id, jeton_hash, expire_le)
       VALUES ($1, $2, NOW() + make_interval(days => $3))
       ON CONFLICT (commande_id) DO NOTHING
       RETURNING id`,
      [commande.commande_id, hash, validiteJours]
    );
    if (rows.length === 0) return null;
    return { ...commande, invitation_id: rows[0].id, jeton };
  }

  static async marquerEnvoi(invitationId: number, canal: 'meta' | 'green_api' | 'echec', relance = false): Promise<void> {
    await query(
      relance
        ? `UPDATE avis_invitations SET relancee_le = NOW(), canal = $2 WHERE id = $1`
        : `UPDATE avis_invitations SET envoyee_le = NOW(), canal = $2 WHERE id = $1`,
      [invitationId, canal]
    );
  }

  /**
   * Invitations à relancer : envoyées depuis au moins `ecartJours`, jamais relancées, encore valides,
   * commande toujours livrée, et au moins un produit pas encore noté.
   * Le jeton n'étant jamais stocké en clair, la relance génère un nouveau jeton (l'ancien lien cesse de fonctionner)
   * et prolonge la validité.
   */
  static async relancer(ecartJours: number, validiteJours: number, limite: number): Promise<InvitationCreee[]> {
    const { rows } = await query<CommandeAInviter & { invitation_id: number }>(
      `SELECT i.id AS invitation_id, c.id AS commande_id, c.numero_commande, c.client_nom, c.client_telephone, b.nom AS boutique_nom
       FROM avis_invitations i
       JOIN commandes c ON c.id = i.commande_id
       JOIN boutiques b ON b.id = c.boutique_id
       WHERE i.envoyee_le IS NOT NULL
         AND i.envoyee_le <= NOW() - make_interval(days => $1)
         AND i.relancee_le IS NULL
         AND i.utilisee_le IS NULL
         AND i.canal IS DISTINCT FROM 'echec'
         AND i.expire_le > NOW()
         AND c.statut = 'livree'
         AND NOT EXISTS (SELECT 1 FROM avis_produits a WHERE a.commande_id = c.id)
       ORDER BY i.envoyee_le
       LIMIT $2`,
      [ecartJours, limite]
    );
    const resultat: InvitationCreee[] = [];
    for (const ligne of rows) {
      const { jeton, hash } = genererJetonAvis();
      await query(
        `UPDATE avis_invitations SET jeton_hash = $2, expire_le = NOW() + make_interval(days => $3) WHERE id = $1`,
        [ligne.invitation_id, hash, validiteJours]
      );
      resultat.push({ ...ligne, jeton });
    }
    return resultat;
  }

  /** Invitation valide (non expirée, commande livrée) telle que présentée sur la page publique. */
  static async trouverPublique(jetonHash: string): Promise<InvitationAvisPublique | null> {
    const { rows } = await query<{
      id: number;
      commande_id: number;
      numero_commande: string;
      client_nom: string;
      expire_le: Date;
      boutique_nom: string;
      boutique_slug: string;
      boutique_logo: string | null;
    }>(
      `SELECT i.id, i.commande_id, c.numero_commande, c.client_nom, i.expire_le,
              b.nom AS boutique_nom, b.slug AS boutique_slug, b.logo AS boutique_logo
       FROM avis_invitations i
       JOIN commandes c ON c.id = i.commande_id
       JOIN boutiques b ON b.id = c.boutique_id
       WHERE i.jeton_hash = $1 AND i.expire_le > NOW() AND c.statut = 'livree'`,
      [jetonHash]
    );
    const inv = rows[0];
    if (!inv) return null;

    const produits = await AvisInvitationModel.produitsANoter(inv.commande_id);
    if (produits.length === 0) return null;

    await query('UPDATE avis_invitations SET ouverte_le = COALESCE(ouverte_le, NOW()) WHERE id = $1', [inv.id]);

    return {
      numero_commande: inv.numero_commande,
      prenom_client: prenomClient(inv.client_nom),
      boutique: { nom: inv.boutique_nom, slug: inv.boutique_slug, logo: inv.boutique_logo },
      produits,
      expire_le: new Date(inv.expire_le).toISOString(),
      terminee: produits.every((p) => p.deja_note)
    };
  }

  /** Produits distincts de la commande, hors billets d'événement. */
  static async produitsANoter(commandeId: number, client?: PoolClient): Promise<ProduitANoter[]> {
    const executer = client ? client.query.bind(client) : query;
    const { rows } = await executer(
      `SELECT DISTINCT ON (ca.produit_id) ca.produit_id, COALESCE(p.nom, ca.nom_produit) AS nom_produit,
              ${IMAGE_PRODUIT} AS image,
              EXISTS (SELECT 1 FROM avis_produits a WHERE a.commande_id = ca.commande_id AND a.produit_id = ca.produit_id) AS deja_note
       FROM commande_articles ca
       JOIN produits p ON p.id = ca.produit_id
       WHERE ca.commande_id = $1 AND NOT ${CONDITION_EVENEMENT}
       ORDER BY ca.produit_id, ca.id`,
      [commandeId]
    );
    return rows as ProduitANoter[];
  }

  /**
   * Enregistre les avis d'une invitation, en transaction : verrou sur l'invitation, contrôle que chaque
   * produit appartient à la commande, unicité (commande, produit) garantie par la base.
   * Renvoie null si l'invitation est invalide ou expirée.
   */
  static async soumettre(
    jetonHash: string,
    avis: AvisSoumis[],
    meta: { ip_hash: string | null; user_agent: string | null }
  ): Promise<ResultatSoumission | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; commande_id: number; client_nom: string; client_telephone: string; client_email: string | null }>(
        `SELECT i.id, i.commande_id, c.client_nom, c.client_telephone, c.client_email
         FROM avis_invitations i
         JOIN commandes c ON c.id = i.commande_id
         WHERE i.jeton_hash = $1 AND i.expire_le > NOW() AND c.statut = 'livree'
         FOR UPDATE OF i`,
        [jetonHash]
      );
      const inv = rows[0];
      if (!inv) return null;

      const notables = await AvisInvitationModel.produitsANoter(inv.commande_id, client);
      const autorises = new Map(notables.map((p) => [p.produit_id, p]));
      const resultat: ResultatSoumission = { crees: [], ignores: [], terminee: false };
      const aRecalculer = new Set<number>();

      for (const a of avis) {
        const produit = autorises.get(a.produit_id);
        if (!produit || produit.deja_note) {
          resultat.ignores.push(a.produit_id);
          continue;
        }
        const insertion = await client.query<{ id: number; statut: StatutAvis }>(
          `INSERT INTO avis_produits (produit_id, commande_id, invitation_id, commande_article_id, nom_client, email_client,
                                      telephone_client, note, commentaire, statut, signale_auto, motifs_auto,
                                      ip_hash, user_agent, date_moderation, date_creation, date_modification)
           VALUES ($1, $2, $3,
                   (SELECT id FROM commande_articles WHERE commande_id = $2 AND produit_id = $1 ORDER BY id LIMIT 1),
                   $4, $5, $6, $7, $8, $9::statut_avis, $10, $11, $12, $13,
                   CASE WHEN $9 = 'approuve' THEN NOW() END, NOW(), NOW())
           ON CONFLICT (commande_id, produit_id) DO NOTHING
           RETURNING id, statut`,
          [
            a.produit_id,
            inv.commande_id,
            inv.id,
            inv.client_nom,
            inv.client_email,
            inv.client_telephone,
            a.note,
            a.commentaire,
            a.statut,
            a.signale_auto,
            a.motifs_auto,
            meta.ip_hash,
            meta.user_agent
          ]
        );
        if (insertion.rows.length === 0) {
          resultat.ignores.push(a.produit_id);
          continue;
        }
        produit.deja_note = true;
        resultat.crees.push({
          id: insertion.rows[0].id,
          produit_id: a.produit_id,
          note: a.note,
          statut: insertion.rows[0].statut,
          signale_auto: a.signale_auto
        });
        if (insertion.rows[0].statut === 'approuve') aRecalculer.add(a.produit_id);
      }

      resultat.terminee = notables.every((p) => p.deja_note);
      if (resultat.terminee) {
        await client.query('UPDATE avis_invitations SET utilisee_le = NOW() WHERE id = $1', [inv.id]);
      }
      for (const produitId of aRecalculer) await recalculer(client, produitId);
      return resultat;
    });
  }
}

export class AvisModel {
  /** Avis approuvés d'un produit (forme publique, aucune donnée personnelle). */
  static async listerPublics(produitId: number, page: number, limite: number): Promise<{ avis: AvisPublic[]; total: number }> {
    const offset = (page - 1) * limite;
    const [liste, total] = await Promise.all([
      query<{
        id: number;
        note: number;
        commentaire: string | null;
        nom_client: string;
        commande_id: number | null;
        date_creation: Date;
        reponse_vendeur: string | null;
        date_reponse_vendeur: Date | null;
      }>(
        `SELECT id, note, commentaire, nom_client, commande_id, date_creation, reponse_vendeur, date_reponse_vendeur
         FROM avis_produits
         WHERE produit_id = $1 AND statut = 'approuve'
         ORDER BY date_creation DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [produitId, limite, offset]
      ),
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM avis_produits WHERE produit_id = $1 AND statut = 'approuve'`,
        [produitId]
      )
    ]);
    return {
      avis: liste.rows.map((l) => ({
        id: l.id,
        note: l.note,
        commentaire: l.commentaire,
        auteur: nomAuteurAvis(l.nom_client),
        achat_verifie: l.commande_id !== null,
        date_creation: iso(l.date_creation) as string,
        reponse_vendeur: l.reponse_vendeur,
        date_reponse_vendeur: iso(l.date_reponse_vendeur)
      })),
      total: total.rows[0]?.total ?? 0
    };
  }

  /** Résumé d'un produit visible (actif) : moyenne, nombre, répartition par note. Null si produit introuvable. */
  static async resumeProduit(produitId: number, seuil: number): Promise<ResumeAvisProduit | null> {
    const { rows } = await query<{ note_moyenne: string | null; nombre_avis: number | null; repartition: Record<string, number> | null }>(
      `SELECT p.note_moyenne, p.nombre_avis,
              (SELECT json_object_agg(note, n) FROM (
                 SELECT note, COUNT(*)::int AS n FROM avis_produits WHERE produit_id = p.id AND statut = 'approuve' GROUP BY note
               ) r) AS repartition
       FROM produits p WHERE p.id = $1 AND p.statut = 'actif'`,
      [produitId]
    );
    const l = rows[0];
    if (!l) return null;
    const nombre = l.nombre_avis ?? 0;
    const repartition = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ResumeAvisProduit['repartition'];
    for (const [note, n] of Object.entries(l.repartition ?? {})) {
      const k = Number(note) as 1 | 2 | 3 | 4 | 5;
      if (k in repartition) repartition[k] = n;
    }
    return {
      note_moyenne: Number(l.note_moyenne ?? 0),
      nombre_avis: nombre,
      afficher_note: nombre >= seuil,
      repartition
    };
  }

  /** Liste paginée (vendeur : restreinte à ses boutiques ; admin : vendeurId = null). */
  static async lister(
    filtres: FiltresAvis,
    vendeurId: number | null
  ): Promise<{ avis: AvisDetaille[]; total: number; page: number; limite: number }> {
    const page = Math.max(1, filtres.page ?? 1);
    const limite = Math.min(100, Math.max(1, filtres.limite ?? 20));
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (vendeurId !== null) {
      params.push(vendeurId);
      conditions.push(`b.vendeur_id = $${params.length}`);
    }
    construireFiltres(filtres, params, conditions);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM avis_produits a JOIN produits p ON p.id = a.produit_id JOIN boutiques b ON b.id = p.boutique_id
       LEFT JOIN commandes c ON c.id = a.commande_id ${where}`,
      params
    );
    const { rows } = await query<LigneAvisDetaille>(
      `${SELECT_DETAILLE} ${where}
       ORDER BY a.date_creation DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, (page - 1) * limite]
    );
    return { avis: rows.map((l) => versDetaille(l, vendeurId === null)), total: total.rows[0]?.total ?? 0, page, limite };
  }

  static async trouver(id: number, vendeurId: number | null = null): Promise<AvisDetaille | null> {
    const params: unknown[] = [id];
    let condition = 'a.id = $1';
    if (vendeurId !== null) {
      params.push(vendeurId);
      condition += ' AND b.vendeur_id = $2';
    }
    const { rows } = await query<LigneAvisDetaille>(`${SELECT_DETAILLE} WHERE ${condition}`, params);
    return rows[0] ? versDetaille(rows[0], vendeurId === null) : null;
  }

  static async stats(): Promise<StatsAvis> {
    const { rows } = await query<StatsAvis>(
      `SELECT
         (SELECT COUNT(*)::int FROM avis_produits WHERE statut = 'en_attente') AS en_attente,
         (SELECT COUNT(*)::int FROM avis_produits a WHERE ${CONDITION_SIGNALE}) AS signales,
         (SELECT COUNT(*)::int FROM avis_produits WHERE statut = 'approuve') AS approuves,
         (SELECT COUNT(*)::int FROM avis_produits WHERE statut = 'rejete') AS rejetes,
         (SELECT COUNT(*)::int FROM avis_invitations WHERE envoyee_le >= NOW() - INTERVAL '30 days' AND canal <> 'echec') AS invitations_envoyees_30j,
         (SELECT COUNT(*)::int FROM avis_produits WHERE date_creation >= LOCALTIMESTAMP - INTERVAL '30 days') AS avis_recus_30j`
    );
    return rows[0];
  }

  /** Nombre d'avis approuvés sans réponse (badge du dashboard vendeur). */
  static async compterSansReponse(vendeurId: number): Promise<number> {
    const { rows } = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM avis_produits a
       JOIN produits p ON p.id = a.produit_id JOIN boutiques b ON b.id = p.boutique_id
       WHERE b.vendeur_id = $1 AND a.statut = 'approuve' AND a.reponse_vendeur IS NULL`,
      [vendeurId]
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Change le statut (modération) et recalcule les agrégats.
   * Renvoie l'avis avant modification (pour savoir s'il faut notifier) ou null s'il n'existe pas.
   */
  static async moderer(
    id: number,
    statut: 'approuve' | 'rejete',
    moderePar: string | null,
    motifRejet: string | null
  ): Promise<{ avant: StatutAvis; produit_id: number } | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ statut: StatutAvis; produit_id: number }>(
        'SELECT statut, produit_id FROM avis_produits WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!rows[0]) return null;
      await client.query(
        `UPDATE avis_produits SET
           statut = $2::statut_avis,
           motif_rejet = CASE WHEN $2 = 'rejete' THEN $3 ELSE NULL END,
           signale_par_vendeur = CASE WHEN $2 = 'approuve' THEN FALSE ELSE signale_par_vendeur END,
           modere_par = $4,
           date_moderation = NOW(),
           date_modification = NOW()
         WHERE id = $1`,
        [id, statut, motifRejet, moderePar]
      );
      await recalculer(client, rows[0].produit_id);
      return { avant: rows[0].statut, produit_id: rows[0].produit_id };
    });
  }

  /** Suppression physique (demande de retrait du client) et recalcul. */
  static async supprimer(id: number): Promise<boolean> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ produit_id: number }>('DELETE FROM avis_produits WHERE id = $1 RETURNING produit_id', [id]);
      if (!rows[0]) return false;
      await recalculer(client, rows[0].produit_id);
      return true;
    });
  }

  /**
   * Réponse publique du vendeur. Une seule réponse par avis, modifiable pendant `delaiModificationHeures`.
   * Renvoie 'introuvable' | 'non_publie' | 'delai_depasse' | 'ok'.
   */
  static async repondre(
    id: number,
    vendeurId: number,
    reponse: string,
    delaiModificationHeures: number
  ): Promise<'introuvable' | 'non_publie' | 'delai_depasse' | 'ok'> {
    const { rows } = await query<{ statut: StatutAvis; date_reponse_vendeur: Date | null }>(
      `SELECT a.statut, a.date_reponse_vendeur FROM avis_produits a
       JOIN produits p ON p.id = a.produit_id JOIN boutiques b ON b.id = p.boutique_id
       WHERE a.id = $1 AND b.vendeur_id = $2`,
      [id, vendeurId]
    );
    const avis = rows[0];
    if (!avis) return 'introuvable';
    if (avis.statut !== 'approuve') return 'non_publie';
    if (avis.date_reponse_vendeur && Date.now() - new Date(avis.date_reponse_vendeur).getTime() > delaiModificationHeures * 3600_000) {
      return 'delai_depasse';
    }
    await query(
      `UPDATE avis_produits SET reponse_vendeur = $2,
         date_reponse_vendeur = COALESCE(date_reponse_vendeur, NOW()), date_modification = NOW()
       WHERE id = $1`,
      [id, reponse]
    );
    return 'ok';
  }

  /** Signalement par le vendeur (motif obligatoire) : l'avis reste visible, l'équipe tranche. */
  static async signaler(id: number, vendeurId: number, motif: string): Promise<AvisDetaille | null> {
    const { rowCount } = await query(
      `UPDATE avis_produits a SET signale_par_vendeur = TRUE, motif_signalement = $3, date_signalement = NOW(), date_modification = NOW()
       FROM produits p, boutiques b
       WHERE a.id = $1 AND p.id = a.produit_id AND b.id = p.boutique_id AND b.vendeur_id = $2 AND a.statut <> 'rejete'`,
      [id, vendeurId, motif]
    );
    if (!rowCount) return null;
    return AvisModel.trouver(id, vendeurId);
  }

  /**
   * Commande annulée ou remboursée après coup : ses avis non rejetés passent « rejeté »
   * (motif commande_annulee), son invitation expire, les agrégats sont recalculés.
   */
  static async invaliderCommande(commandeId: number): Promise<number> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ produit_id: number }>(
        `UPDATE avis_produits SET statut = 'rejete', motif_rejet = 'commande_annulee', modere_par = 'automatique',
           date_moderation = NOW(), date_modification = NOW()
         WHERE commande_id = $1 AND statut <> 'rejete'
         RETURNING produit_id`,
        [commandeId]
      );
      await client.query('UPDATE avis_invitations SET expire_le = NOW() WHERE commande_id = $1 AND expire_le > NOW()', [commandeId]);
      for (const produitId of new Set(rows.map((r) => r.produit_id))) await recalculer(client, produitId);
      return rows.length;
    });
  }

  /** Données pour notifier le vendeur d'un avis publié. */
  static async contexteNotification(id: number): Promise<{
    vendeur_id: number;
    vendeur_telephone: string | null;
    boutique_slug: string;
    produit_nom: string;
    note: number;
  } | null> {
    const { rows } = await query<{
      vendeur_id: number;
      vendeur_telephone: string | null;
      boutique_slug: string;
      produit_nom: string;
      note: number;
    }>(
      `SELECT b.vendeur_id, v.telephone AS vendeur_telephone, b.slug AS boutique_slug, p.nom AS produit_nom, a.note
       FROM avis_produits a
       JOIN produits p ON p.id = a.produit_id
       JOIN boutiques b ON b.id = p.boutique_id
       JOIN vendeurs v ON v.id = b.vendeur_id
       WHERE a.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }
}
