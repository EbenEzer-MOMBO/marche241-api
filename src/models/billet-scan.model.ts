import { query } from '../config/database';
import { BilletScan, ModeScan, ResultatScan, SourceScan } from '../lib/database-types';

/** Billet lu pour un contrôle, avec le statut de sa commande. */
export interface BilletControle {
  id: number;
  produit_id: number;
  commande_id: number;
  numero: number;
  type_billet: string;
  jeton: string;
  scanne_le: Date | null;
  participant_nom: string | null;
  participant_telephone: string | null;
  client_nom: string;
  client_telephone: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
}

/** Événement d'un vendeur, tel que listé par le scanner. */
export interface EvenementVendeur {
  id: number;
  nom: string;
  statut: string;
  variants: any;
  image_principale: string | null;
  images: string[] | null;
  boutique_id: number;
  boutique_nom: string;
  boutique_slug: string;
  billets_vendus: number;
  billets_scannes: number;
}

export interface EntreeJournalScan {
  produit_id: number;
  billet_id: number | null;
  vendeur_id: number | null;
  resultat: ResultatScan;
  mode: ModeScan;
  source: SourceScan;
  appareil_id?: string | null;
  scanne_a: Date;
}

/** Ligne du journal enrichie pour l'affichage (vendeur et back-office). */
export interface LigneJournalScan extends BilletScan {
  numero: number | null;
  type_billet: string | null;
  titulaire: string | null;
}

const SELECT_BILLET_CONTROLE = `
  SELECT b.id, b.produit_id, b.commande_id, b.numero, b.type_billet, b.jeton, b.scanne_le,
         b.participant_nom, b.participant_telephone,
         c.client_nom, c.client_telephone, c.numero_commande, c.statut, c.statut_paiement
    FROM billets b
    JOIN commandes c ON c.id = b.commande_id`;

export class BilletScanModel {
  /** Billets correspondant à un QR (un même jeton couvre toute la commande). */
  static async findByQr(jeton: string, numero: number): Promise<BilletControle[]> {
    const { rows } = await query<BilletControle>(
      `${SELECT_BILLET_CONTROLE} WHERE b.jeton = $1 AND b.numero = $2`,
      [jeton, numero]
    );
    return rows;
  }

  static async findControleById(id: number): Promise<BilletControle | null> {
    const { rows } = await query<BilletControle>(`${SELECT_BILLET_CONTROLE} WHERE b.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /**
   * Validation atomique : seul le premier appel renseigne `scanne_le`, et seulement si la commande
   * est encore valide au même instant (une annulation concurrente ne laisse pas passer le billet).
   * Renvoie null si le billet était déjà scanné ou si la commande n'est plus valide.
   */
  static async validerSiNonScanne(id: number, instant: Date): Promise<Date | null> {
    const { rows } = await query<{ scanne_le: Date }>(
      `UPDATE billets b SET scanne_le = $2
         FROM commandes c
        WHERE b.id = $1
          AND b.scanne_le IS NULL
          AND c.id = b.commande_id
          AND c.statut_paiement = 'paye'
          AND c.statut NOT IN ('annulee', 'remboursee')
        RETURNING b.scanne_le`,
      [id, instant]
    );
    return rows[0]?.scanne_le ?? null;
  }

  /** Billets d'un événement pour le cache de la PWA (le jeton est converti en empreinte par le service). */
  static async billetsCache(produitId: number, depuis?: Date): Promise<BilletControle[]> {
    const params: unknown[] = [produitId];
    let filtre = '';
    if (depuis) {
      // Synchro différentielle : billets émis, dont la commande a changé, ou contrôlés depuis.
      // Le journal (recu_le) couvre les scans hors-ligne synchronisés (scanne_le = heure de l'appareil,
      // antérieure à `depuis`) et les annulations du dashboard (scanne_le remis à NULL).
      params.push(depuis);
      filtre = ` AND (b.date_creation > $2 OR b.scanne_le > $2 OR c.date_modification > $2
                  OR EXISTS (SELECT 1 FROM billets_scans s WHERE s.billet_id = b.id AND s.recu_le > $2))`;
    }
    const { rows } = await query<BilletControle>(
      `${SELECT_BILLET_CONTROLE} WHERE b.produit_id = $1${filtre} ORDER BY b.numero`,
      params
    );
    return rows;
  }

  /** Identifiants de tous les billets d'un événement (la PWA retire de son cache ceux qui ont disparu). */
  static async idsBillets(produitId: number): Promise<number[]> {
    const { rows } = await query<{ id: string }>(`SELECT id FROM billets WHERE produit_id = $1`, [produitId]);
    return rows.map((r) => Number(r.id));
  }

  static async evenementsVendeur(vendeurId: number): Promise<EvenementVendeur[]> {
    const { rows } = await query<EvenementVendeur>(
      `SELECT p.id, p.nom, p.statut, p.variants, p.image_principale, p.images,
              bo.id AS boutique_id, bo.nom AS boutique_nom, bo.slug AS boutique_slug,
              v.billets_vendus, v.billets_scannes
         FROM produits p
         JOIN boutiques bo ON bo.id = p.boutique_id
         -- Billets valides seulement (même règle que estCommandeValide) : ce sont les entrées attendues
         CROSS JOIN LATERAL (
           SELECT COUNT(*)::int AS billets_vendus,
                  COUNT(*) FILTER (WHERE b.scanne_le IS NOT NULL)::int AS billets_scannes
             FROM billets b
             JOIN commandes c ON c.id = b.commande_id
            WHERE b.produit_id = p.id
              AND c.statut_paiement = 'paye'
              AND c.statut NOT IN ('annulee', 'remboursee')
         ) v
        WHERE bo.vendeur_id = $1
          AND p.variants->>'type' = 'evenement'
          AND p.statut <> 'archive'
        ORDER BY p.variants->'meta'->>'date_debut' DESC NULLS LAST, p.id DESC`,
      [vendeurId]
    );
    return rows;
  }

  static async journaliser(entree: EntreeJournalScan): Promise<void> {
    await query(
      `INSERT INTO billets_scans (produit_id, billet_id, vendeur_id, resultat, mode, source, appareil_id, scanne_a)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entree.produit_id,
        entree.billet_id,
        entree.vendeur_id,
        entree.resultat,
        entree.mode,
        entree.source,
        entree.appareil_id ?? null,
        entree.scanne_a
      ]
    );
  }

  static async journalProduit(
    produitId: number,
    options: { page: number; limite: number; resultat?: ResultatScan }
  ): Promise<{ scans: LigneJournalScan[]; total: number; resume: Record<string, number> }> {
    const params: unknown[] = [produitId];
    let filtre = '';
    if (options.resultat) {
      params.push(options.resultat);
      filtre = ` AND s.resultat = $${params.length}`;
    }
    const offset = (options.page - 1) * options.limite;

    const [liste, total, resume] = await Promise.all([
      query<LigneJournalScan>(
        `SELECT s.*, b.numero, b.type_billet,
                COALESCE(NULLIF(b.participant_nom, ''), c.client_nom) AS titulaire
           FROM billets_scans s
           LEFT JOIN billets b ON b.id = s.billet_id
           LEFT JOIN commandes c ON c.id = b.commande_id
          WHERE s.produit_id = $1${filtre}
          ORDER BY s.recu_le DESC, s.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, options.limite, offset]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM billets_scans s WHERE s.produit_id = $1${filtre}`,
        params
      ),
      query<{ resultat: string; nb: string; hors_ligne: string }>(
        `SELECT resultat, COUNT(*) AS nb, COUNT(*) FILTER (WHERE source = 'hors_ligne') AS hors_ligne
           FROM billets_scans WHERE produit_id = $1 GROUP BY resultat`,
        [produitId]
      )
    ]);

    const parResultat: Record<string, number> = { hors_ligne: 0 };
    for (const ligne of resume.rows) {
      parResultat[ligne.resultat] = Number(ligne.nb);
      parResultat.hors_ligne += Number(ligne.hors_ligne);
    }

    return {
      scans: liste.rows.map((s) => ({ ...s, id: Number(s.id), billet_id: s.billet_id === null ? null : Number(s.billet_id) })),
      total: Number(total.rows[0]?.total ?? 0),
      resume: parResultat
    };
  }
}
