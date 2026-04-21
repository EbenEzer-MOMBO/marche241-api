-- Migration: Ajouter le champ numero_paiement à la table vendeurs
-- Date: 2026-04-21
-- Description: Numéro utilisé pour recevoir les paiements (ex. mobile money)

-- ============================================
-- 1. Ajouter la colonne numero_paiement
-- ============================================

ALTER TABLE vendeurs
ADD COLUMN IF NOT EXISTS numero_paiement VARCHAR(255);

-- ============================================
-- 2. Commentaire sur la colonne
-- ============================================

COMMENT ON COLUMN vendeurs.numero_paiement IS 'Numéro de réception des paiements (identifiant ou téléphone selon le canal).';

-- ============================================
-- 3. Vérification
-- ============================================

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'vendeurs' AND column_name = 'numero_paiement';
