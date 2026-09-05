-- Migration: Création de la table affilies
-- Date: 2026-09-05
-- Description: Table des affiliés du programme d'affiliation Marché241 — inscription
-- minimaliste (nom, email, WhatsApp, pays), code de tracking unique, taux de commission
-- personnalisable par affilié (2,5 % par défaut).

-- ============================================
-- CRÉATION DE LA TABLE AFFILIES
-- ============================================

CREATE TABLE IF NOT EXISTS affilies (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telephone VARCHAR(50) NOT NULL UNIQUE,
  pays VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  statut VARCHAR(20) NOT NULL DEFAULT 'actif',
  taux_commission NUMERIC(5,4) NOT NULL DEFAULT 0.0250,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_modification TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affilies_code ON affilies(code);
CREATE INDEX IF NOT EXISTS idx_affilies_statut ON affilies(statut);

COMMENT ON COLUMN affilies.code IS 'Code de tracking unique format AFF-XXXXXX, valable chez tous les vendeurs de la marketplace';
COMMENT ON COLUMN affilies.statut IS 'actif | inactif';
COMMENT ON COLUMN affilies.taux_commission IS 'Taux de commission personnalisable par affilié (0.0250 = 2,5 % par défaut), copié dans commissions_affiliees.taux à la création de chaque commission';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'affilies'
    ) THEN
        RAISE NOTICE 'Migration réussie: La table affilies a été créée';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La table affilies n''a pas été créée';
    END IF;
END $$;
