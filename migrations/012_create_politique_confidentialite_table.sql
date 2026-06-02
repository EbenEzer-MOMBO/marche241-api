-- Migration: Créer la table politique_confidentialite
-- Date: 2026-06-02
-- Description: Crée la table politique_confidentialite et insère une politique par défaut.

-- ============================================
-- CREATION DE LA TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS politique_confidentialite (
    id SERIAL PRIMARY KEY,
    contenu TEXT NOT NULL,
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ajouter un commentaire pour documenter la table
COMMENT ON TABLE politique_confidentialite IS 'Table stockant la politique de confidentialité de la plateforme';

-- ============================================
-- INSERTION DES DONNEES PAR DEFAUT
-- ============================================

INSERT INTO politique_confidentialite (id, contenu) 
VALUES (1, '<h1>Politique de confidentialité</h1><p>Contenu par défaut de la politique de confidentialité de Marché 241...</p>')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'politique_confidentialite'
    ) THEN
        RAISE NOTICE 'Migration réussie: La table politique_confidentialite a été créée';
    ELSE
        RAISE EXCEPTION 'Migration échouée: La table politique_confidentialite n''a pas été créée';
    END IF;
END $$;
