-- Migration: Ajouter le mode de paiement "acompte 50%"
-- Date: 2026-08-27
-- Description: Ajoute une 3e option de restriction de paiement permettant au vendeur
-- de forcer un acompte de 50% en ligne, solde réglé en espèces à la livraison
-- (vente sur commande).

-- =========================================================
-- 1. Étendre la contrainte CHECK pour autoriser 'acompte_50'
-- =========================================================

ALTER TABLE boutiques
DROP CONSTRAINT IF EXISTS chk_payment_restriction_mode;

ALTER TABLE boutiques
ADD CONSTRAINT chk_payment_restriction_mode
CHECK (payment_restriction_mode IN ('complet_uniquement', 'livraison_uniquement', 'les_deux', 'acompte_50'));

-- =========================================================
-- 2. Commentaire sur la colonne
-- =========================================================

COMMENT ON COLUMN boutiques.payment_restriction_mode IS 'Restriction des paiements : complet_uniquement (paiement intégral requis), livraison_uniquement (frais de livraison seulement), les_deux (le client choisit), acompte_50 (acompte de 50% du total en ligne, solde en espèces à la livraison)';

-- =========================================================
-- 3. Vérification
-- =========================================================

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'boutiques' AND column_name = 'payment_restriction_mode';
