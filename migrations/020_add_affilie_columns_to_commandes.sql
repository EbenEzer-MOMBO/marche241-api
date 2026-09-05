-- Migration: Ajouter les colonnes d'affiliation à la table commandes
-- Date: 2026-09-05
-- Description: Relie une commande à l'affilié dont le code a été utilisé au checkout.
-- code_affilie est conservé même si le code de l'affilié change plus tard (traçabilité).

-- ============================================
-- AJOUT DES COLONNES
-- ============================================

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS affilie_id INTEGER REFERENCES affilies(id),
  ADD COLUMN IF NOT EXISTS code_affilie VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_commandes_affilie_id ON commandes(affilie_id);

COMMENT ON COLUMN commandes.affilie_id IS 'Affilié dont le code a été appliqué à cette commande (NULL si aucun)';
COMMENT ON COLUMN commandes.code_affilie IS 'Code affilié utilisé au moment du checkout, conservé pour traçabilité même si affilies.code change ensuite';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commandes' AND column_name = 'affilie_id'
    ) THEN
        RAISE NOTICE 'Migration réussie: Les colonnes affilie_id/code_affilie ont été ajoutées à commandes';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La colonne affilie_id n''a pas été ajoutée';
    END IF;
END $$;
