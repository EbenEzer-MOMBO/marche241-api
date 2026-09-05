-- Migration: Création de la table affilie_codes_connexion
-- Date: 2026-09-05
-- Description: Stockage des codes OTP à 4 chiffres pour l'authentification du mini
-- dashboard affilié (email + code OTP, jamais le code affilié public AFF-XXXXXX qui
-- est exposé dans les liens de tracking partagés). Le code n'est jamais stocké en clair.

-- ============================================
-- CRÉATION DE LA TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS affilie_codes_connexion (
  id SERIAL PRIMARY KEY,
  affilie_id INTEGER NOT NULL REFERENCES affilies(id),
  code_hash VARCHAR(255) NOT NULL,
  tentatives INTEGER NOT NULL DEFAULT 0,
  expire_le TIMESTAMP NOT NULL,
  utilise_le TIMESTAMP,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affilie_codes_affilie_id ON affilie_codes_connexion(affilie_id);

COMMENT ON COLUMN affilie_codes_connexion.code_hash IS 'Hash du code OTP à 4 chiffres, jamais stocké en clair';
COMMENT ON COLUMN affilie_codes_connexion.tentatives IS 'Incrémenté à chaque échec de vérification, blocage temporaire après 5';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'affilie_codes_connexion'
    ) THEN
        RAISE NOTICE 'Migration réussie: La table affilie_codes_connexion a été créée';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La table affilie_codes_connexion n''a pas été créée';
    END IF;
END $$;
