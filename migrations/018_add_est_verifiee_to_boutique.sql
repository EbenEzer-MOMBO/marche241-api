-- Migration: Ajouter le champ est_verifiee à la table boutiques
-- Date: 2026-08-29
-- Description: Ajoute une colonne pour marquer une boutique comme vérifiée (badge bleu),
-- attribuée manuellement par un admin depuis le tableau de bord.

-- ============================================
-- AJOUT DE LA COLONNE EST_VERIFIEE
-- ============================================

ALTER TABLE boutiques
ADD COLUMN IF NOT EXISTS est_verifiee BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN boutiques.est_verifiee IS 'Indique si la boutique a reçu le badge de vérification (attribution manuelle par un admin)';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'boutiques'
        AND column_name = 'est_verifiee'
    ) THEN
        RAISE NOTICE 'Migration réussie: La colonne est_verifiee a été ajoutée à la table boutiques';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La colonne est_verifiee n''a pas été ajoutée';
    END IF;
END $$;
