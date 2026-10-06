-- ============================================================================
-- Migration 030 : visites guidées vues par les vendeurs
-- ============================================================================
-- Une ligne par vendeur et par visite guidée (ex. « publicite ») : terminée ou
-- passée. Sans ligne, la visite est proposée automatiquement. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendeur_guides (
  vendeur_id INTEGER NOT NULL REFERENCES vendeurs(id) ON DELETE CASCADE,
  guide VARCHAR(50) NOT NULL,
  statut VARCHAR(10) NOT NULL CHECK (statut IN ('termine', 'ignore')),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendeur_id, guide)
);

COMMENT ON TABLE vendeur_guides IS 'Visites guidées de l''espace vendeur terminées (termine) ou passées (ignore)';
