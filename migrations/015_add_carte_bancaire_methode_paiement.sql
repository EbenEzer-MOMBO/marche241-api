-- Migration: Ajouter 'carte_bancaire' à l'enum methode_paiement
-- Date: 2026-08-22
-- Description: Paiement Visa/Mastercard via E-billing / Orabank

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'carte_bancaire'
        AND enumtypid = (
            SELECT oid
            FROM pg_type
            WHERE typname = 'methode_paiement'
        )
    ) THEN
        ALTER TYPE methode_paiement ADD VALUE 'carte_bancaire';
        RAISE NOTICE 'Valeur "carte_bancaire" ajoutée à l''enum methode_paiement';
    ELSE
        RAISE NOTICE 'Valeur "carte_bancaire" existe déjà dans l''enum methode_paiement';
    END IF;
END $$;
