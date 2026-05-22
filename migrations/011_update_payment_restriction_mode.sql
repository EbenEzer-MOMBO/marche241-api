-- Migration: Remplacer is_full_payment_activated par payment_restriction_mode
-- Date: 2026-05-22
-- Description: Permet au vendeur de choisir entre 3 options de restriction de paiement (complet_uniquement, livraison_uniquement, les_deux)

-- =========================================================
-- 1. Ajouter la nouvelle colonne payment_restriction_mode
-- =========================================================

ALTER TABLE boutiques
ADD COLUMN payment_restriction_mode VARCHAR(50) DEFAULT 'les_deux';

-- =========================================================
-- 2. Migrer les anciennes données booléennes
-- =========================================================

-- Si is_full_payment_activated était true (Mode Libre) -> 'les_deux'
UPDATE boutiques
SET payment_restriction_mode = 'les_deux'
WHERE is_full_payment_activated = true;

-- Si is_full_payment_activated était false (Mode Restreint) -> 'livraison_uniquement'
UPDATE boutiques
SET payment_restriction_mode = 'livraison_uniquement'
WHERE is_full_payment_activated = false;

-- =========================================================
-- 3. Ajouter une contrainte CHECK pour les valeurs autorisées
-- =========================================================

ALTER TABLE boutiques
ADD CONSTRAINT chk_payment_restriction_mode
CHECK (payment_restriction_mode IN ('complet_uniquement', 'livraison_uniquement', 'les_deux'));

-- =========================================================
-- 4. Supprimer l'ancienne colonne is_full_payment_activated
-- =========================================================

ALTER TABLE boutiques
DROP COLUMN IF EXISTS is_full_payment_activated;

-- =========================================================
-- 5. Commentaires sur la colonne
-- =========================================================

COMMENT ON COLUMN boutiques.payment_restriction_mode IS 'Restriction des paiements : complet_uniquement (paiement intégral requis), livraison_uniquement (frais de livraison seulement), les_deux (le client choisit)';

-- =========================================================
-- 6. Vérification
-- =========================================================

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'boutiques' AND column_name = 'payment_restriction_mode';
