-- Migration: Ajouter le champ banniere à la table boutiques
-- Date: 2025-11-28
-- Description: Ajoute une colonne pour stocker l'URL de la bannière de la boutique

-- ============================================
-- AJOUT DE LA COLONNE BANNIERE
-- ============================================

-- Ajouter la colonne banniere (URL de l'image de bannière)
ALTER TABLE boutiques
ADD COLUMN IF NOT EXISTS banniere TEXT;

-- Ajouter un commentaire pour documenter la colonne
COMMENT ON COLUMN boutiques.banniere IS 'URL de l''image de bannière de la boutique';

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Vérifier que la colonne a bien été ajoutée
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'boutiques' 
        AND column_name = 'banniere'
    ) THEN
        RAISE NOTICE 'Migration réussie: La colonne banniere a été ajoutée à la table boutiques';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La colonne banniere n''a pas été ajoutée';
    END IF;
END $$;
