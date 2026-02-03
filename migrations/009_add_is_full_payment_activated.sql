-- Migration: Ajouter le champ isFullPaymentActivated à la table boutiques
-- Date: 2026-02-03
-- Description: Permet au vendeur de choisir s'il accepte les paiements complets ou seulement la livraison

-- ============================================
-- 1. Ajouter la colonne is_full_payment_activated
-- ============================================

ALTER TABLE boutiques
ADD COLUMN IF NOT EXISTS is_full_payment_activated BOOLEAN DEFAULT false;

-- ============================================
-- 2. Commentaire sur la colonne
-- ============================================

COMMENT ON COLUMN boutiques.is_full_payment_activated IS 'Si true, le vendeur accepte les paiements complets (articles + livraison). Si false, seuls les frais de livraison sont payables en ligne.';

-- ============================================
-- 3. Vérification
-- ============================================

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'boutiques' AND column_name = 'is_full_payment_activated';
