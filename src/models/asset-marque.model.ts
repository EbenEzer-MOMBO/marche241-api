import { query } from '../config/database';

export interface MediaLigne {
  id: number;
  nom: string;
  url: string;
  storage_path: string;
  mime_type: string;
  taille_octets: number;
  largeur: number | null;
  hauteur: number | null;
  cree_par: string | null;
  created_at: Date;
}

export interface EmplacementLigne extends MediaLigne {
  cle: string;
  libelle: string;
  description: string | null;
  formats: string;
  dimensions_conseillees: string | null;
  media_id: number | null;
  updated_at: Date;
}

export const CLES_ASSETS = [
  'logo_icone',
  'logo_texte',
  'logo_complet',
  'logo_email',
  'favicon',
  'icone_app',
  'image_partage',
  'hero_home',
  'illustration_1',
  'illustration_2',
  'illustration_3',
  'fond_billetterie',
  'image_boutique_defaut',
  'image_produit_defaut',
] as const;

export type CleAsset = (typeof CLES_ASSETS)[number];

export const AssetMarqueModel = {
  async cartePublique(): Promise<Record<string, string | null>> {
    const resultat = await query<{ cle: string; url: string | null }>(
      `SELECT a.cle, m.url
       FROM assets_marque a
       LEFT JOIN medias m ON m.id = a.media_id`
    );
    const carte: Record<string, string | null> = {};
    for (const cle of CLES_ASSETS) {
      carte[cle] = null;
    }
    for (const ligne of resultat.rows) {
      carte[ligne.cle] = ligne.url;
    }
    return carte;
  },

  async listerMedias(recherche: string, type: string, page: number, limite: number): Promise<{ medias: MediaLigne[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (recherche) {
      params.push(`%${recherche}%`);
      conditions.push(`nom ILIKE $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`mime_type = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM medias ${where}`, params);
    params.push(limite, (page - 1) * limite);
    const lignes = await query<MediaLigne>(
      `SELECT * FROM medias ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { medias: lignes.rows, total: Number(total.rows[0]?.count ?? 0) };
  },

  async creerMedia(donnees: Omit<MediaLigne, 'id' | 'created_at'>): Promise<MediaLigne> {
    const resultat = await query<MediaLigne>(
      `INSERT INTO medias (nom, url, storage_path, mime_type, taille_octets, largeur, hauteur, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [donnees.nom, donnees.url, donnees.storage_path, donnees.mime_type, donnees.taille_octets, donnees.largeur, donnees.hauteur, donnees.cree_par]
    );
    return resultat.rows[0];
  },

  async trouverMedia(id: number): Promise<MediaLigne | null> {
    const resultat = await query<MediaLigne>('SELECT * FROM medias WHERE id = $1', [id]);
    return resultat.rows[0] ?? null;
  },

  /** Supprime le média ; retourne false s'il est affecté à un emplacement (FK RESTRICT). */
  async supprimerMedia(id: number): Promise<boolean> {
    try {
      await query('DELETE FROM medias WHERE id = $1', [id]);
      return true;
    } catch (error) {
      if (['23001', '23503'].includes((error as { code?: string }).code ?? '')) {
        return false;
      }
      throw error;
    }
  },

  async listerEmplacements(): Promise<Array<Record<string, unknown>>> {
    const resultat = await query(
      `SELECT a.cle, a.libelle, a.description, a.formats, a.dimensions_conseillees, a.media_id, a.updated_at,
              m.nom AS media_nom, m.url AS media_url, m.mime_type AS media_mime, m.largeur, m.hauteur
       FROM assets_marque a
       LEFT JOIN medias m ON m.id = a.media_id
       ORDER BY array_position($1::text[], a.cle::text), a.cle`,
      [CLES_ASSETS]
    );
    return resultat.rows;
  },

  async trouverEmplacement(cle: string): Promise<{ cle: string; formats: string } | null> {
    const resultat = await query<{ cle: string; formats: string }>(
      'SELECT cle, formats FROM assets_marque WHERE cle = $1',
      [cle]
    );
    return resultat.rows[0] ?? null;
  },

  async affecter(cle: string, mediaId: number | null): Promise<void> {
    await query(
      'UPDATE assets_marque SET media_id = $2, updated_at = NOW() WHERE cle = $1',
      [cle, mediaId]
    );
  },

  async urlLogoEmail(): Promise<string | null> {
    const resultat = await query<{ url: string }>(
      `SELECT m.url FROM assets_marque a
       JOIN medias m ON m.id = a.media_id
       WHERE a.cle = 'logo_email'`
    );
    return resultat.rows[0]?.url ?? null;
  },
};
