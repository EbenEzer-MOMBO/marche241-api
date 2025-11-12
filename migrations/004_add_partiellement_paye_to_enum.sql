-- Migration: Ajouter 'partiellement_paye' à l'enum statut_paiement
-- Date: 2025-11-12
-- Description: Ajoute la valeur 'partiellement_paye' à l'enum statut_paiement pour supporter les paiements partiels

-- ============================================
-- 1. Ajouter la valeur à l'enum statut_paiement
-- ============================================

-- Vérifier si l'enum existe et ajouter la valeur si elle n'existe pas déjà
DO $$ 
BEGIN
    -- Vérifier si la valeur existe déjà
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'partiellement_paye' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'statut_paiement'
        )
    ) THEN
        -- Ajouter la nouvelle valeur à l'enum
        ALTER TYPE statut_paiement ADD VALUE 'partiellement_paye';
        RAISE NOTICE 'Valeur "partiellement_paye" ajoutée à l''enum statut_paiement';
    ELSE
        RAISE NOTICE 'Valeur "partiellement_paye" existe déjà dans l''enum statut_paiement';
    END IF;
END $$;

-- ============================================
-- 2. Vérification
-- ============================================

-- Afficher toutes les valeurs de l'enum statut_paiement
DO $$
DECLARE
    v_enum_value TEXT;
BEGIN
    RAISE NOTICE 'Valeurs actuelles de l''enum statut_paiement:';
    FOR v_enum_value IN 
        SELECT enumlabel 
        FROM pg_enum 
        WHERE enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'statut_paiement'
        )
        ORDER BY enumsortorder
    LOOP
        RAISE NOTICE '  - %', v_enum_value;
    END LOOP;
END $$;

