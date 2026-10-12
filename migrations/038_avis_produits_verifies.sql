-- ============================================================================
-- Migration 038 : avis produits vérifiés par achat (KOR-16)
-- ============================================================================
-- Seuls les acheteurs dont la commande est livrée peuvent noter, via un lien à
-- jeton unique reçu sur WhatsApp (seule l'empreinte SHA-256 du jeton est stockée).
-- Tout avis passe par la modération de l'équipe ; les agrégats note_moyenne /
-- nombre_avis (produits + boutiques) ne comptent que les avis approuvés.
--
-- La table avis_produits existe déjà (schéma initial, vide) : on la complète.
-- Idempotente.
-- ⚠️ À appliquer d'abord sur une branche Neon, puis sur la base principale avec accord explicite.
-- ============================================================================

-- 1. Invitations (une par commande)
CREATE TABLE IF NOT EXISTS avis_invitations (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  jeton_hash CHAR(64) NOT NULL,
  expire_le TIMESTAMPTZ NOT NULL,
  envoyee_le TIMESTAMPTZ,
  relancee_le TIMESTAMPTZ,
  canal VARCHAR(20),
  ouverte_le TIMESTAMPTZ,
  utilisee_le TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS avis_invitations_commande_unique ON avis_invitations (commande_id);
CREATE UNIQUE INDEX IF NOT EXISTS avis_invitations_jeton_unique ON avis_invitations (jeton_hash);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avis_invitations_canal_valide') THEN
    ALTER TABLE avis_invitations
      ADD CONSTRAINT avis_invitations_canal_valide CHECK (canal IS NULL OR canal IN ('meta', 'green_api', 'echec'));
  END IF;
END $$;

COMMENT ON TABLE avis_invitations IS 'Invitations à laisser un avis (lien WhatsApp à jeton), une par commande livrée';
COMMENT ON COLUMN avis_invitations.jeton_hash IS 'SHA-256 hexadécimal du jeton envoyé au client (le jeton en clair n''est jamais stocké)';

-- 2. Compléments sur avis_produits
ALTER TABLE avis_produits
  ADD COLUMN IF NOT EXISTS invitation_id INTEGER REFERENCES avis_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commande_article_id INTEGER REFERENCES commande_articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reponse_vendeur TEXT,
  ADD COLUMN IF NOT EXISTS date_reponse_vendeur TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signale_auto BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motifs_auto TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS signale_par_vendeur BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motif_signalement TEXT,
  ADD COLUMN IF NOT EXISTS date_signalement TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif_rejet TEXT,
  ADD COLUMN IF NOT EXISTS modere_par VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ip_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255),
  ADD COLUMN IF NOT EXISTS date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE avis_produits SET statut = 'en_attente' WHERE statut IS NULL;
ALTER TABLE avis_produits ALTER COLUMN statut SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avis_produits_commande_produit_unique') THEN
    ALTER TABLE avis_produits
      ADD CONSTRAINT avis_produits_commande_produit_unique UNIQUE (commande_id, produit_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avis_produits_commentaire_longueur') THEN
    ALTER TABLE avis_produits
      ADD CONSTRAINT avis_produits_commentaire_longueur CHECK (commentaire IS NULL OR char_length(commentaire) <= 2000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avis_produits_reponse_longueur') THEN
    ALTER TABLE avis_produits
      ADD CONSTRAINT avis_produits_reponse_longueur CHECK (reponse_vendeur IS NULL OR char_length(reponse_vendeur) <= 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_avis_produit_publics
  ON avis_produits (produit_id, date_creation DESC) WHERE statut = 'approuve';
CREATE INDEX IF NOT EXISTS idx_avis_en_attente
  ON avis_produits (date_creation) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS idx_avis_commande ON avis_produits (commande_id);

COMMENT ON COLUMN avis_produits.signale_auto IS 'Marqué par le filtre automatique (lien, téléphone, e-mail, mot interdit) : jamais approuvé automatiquement';
COMMENT ON COLUMN avis_produits.modere_par IS 'Nom ou e-mail du membre de l''équipe qui a modéré (transmis par le back-office)';

-- 3. Paramètres (clé / valeur, même forme que boost_parametres)
CREATE TABLE IF NOT EXISTS avis_parametres (
  cle VARCHAR(80) PRIMARY KEY,
  valeur TEXT NOT NULL,
  date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO avis_parametres (cle, valeur) VALUES
  ('actif', 'false'),
  ('delai_invitation_jours', '3'),
  ('relance_jours', '10'),
  ('validite_jeton_jours', '30'),
  ('auto_approbation', 'aucune'),
  ('seuil_affichage_note', '3'),
  ('mots_interdits', '[]'),
  ('longueur_max_commentaire', '1000')
ON CONFLICT (cle) DO NOTHING;

-- 4. Recalcul des agrégats (avis approuvés uniquement), produit puis boutique
CREATE OR REPLACE FUNCTION recalculer_note_avis(p_produit_id INTEGER) RETURNS VOID AS $$
DECLARE
  v_boutique_id INTEGER;
BEGIN
  UPDATE produits p SET
    note_moyenne = COALESCE(s.moyenne, 0),
    nombre_avis = COALESCE(s.nombre, 0)
  FROM (
    SELECT ROUND(AVG(note)::numeric, 1) AS moyenne, COUNT(*)::int AS nombre
    FROM avis_produits WHERE produit_id = p_produit_id AND statut = 'approuve'
  ) s
  WHERE p.id = p_produit_id
  RETURNING p.boutique_id INTO v_boutique_id;

  IF v_boutique_id IS NOT NULL THEN
    UPDATE boutiques b SET
      note_moyenne = COALESCE(s.moyenne, 0),
      nombre_avis = COALESCE(s.nombre, 0)
    FROM (
      SELECT ROUND(AVG(a.note)::numeric, 1) AS moyenne, COUNT(*)::int AS nombre
      FROM avis_produits a JOIN produits pr ON pr.id = a.produit_id
      WHERE pr.boutique_id = v_boutique_id AND a.statut = 'approuve'
    ) s
    WHERE b.id = v_boutique_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Événements Telegram activés par défaut
UPDATE notifications_telegram
SET evenements = evenements || ARRAY(
  SELECT e FROM unnest(ARRAY['avis_a_moderer', 'avis_signale']) e WHERE NOT (e = ANY(evenements))
)
WHERE id = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'avis_invitations')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'avis_parametres')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'avis_produits' AND column_name = 'reponse_vendeur') THEN
    RAISE NOTICE 'Migration 038 réussie : avis_invitations, avis_parametres, compléments avis_produits';
  ELSE
    RAISE EXCEPTION 'Migration 038 échouée';
  END IF;
END $$;
