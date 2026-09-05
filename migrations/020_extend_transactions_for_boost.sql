-- Migration: 020
-- Date: 2026-09-05
-- Description: Étend la table transactions pour supporter le paiement à l'acte des boosts publicitaires
-- (réutilise l'infrastructure de paiement existante — Ebilling, polling, réconciliation — plutôt
-- qu'une table de paiement dédiée). Une transaction de boost n'a pas de commande_id.

-- ============================================
-- 1. Rendre commande_id nullable si nécessaire
-- ============================================
-- La table transactions préexiste aux migrations numérotées de ce dossier ; on vérifie donc
-- dynamiquement l'état de la contrainte avant de la modifier, pour rester idempotent.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions'
          AND column_name = 'commande_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE transactions ALTER COLUMN commande_id DROP NOT NULL;
        RAISE NOTICE 'Contrainte NOT NULL supprimée sur transactions.commande_id';
    ELSE
        RAISE NOTICE 'transactions.commande_id est déjà nullable, aucune modification nécessaire';
    END IF;
END $$;

-- ============================================
-- 2. Ajouter la colonne boost_id
-- ============================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS boost_id INTEGER NULL REFERENCES boosts(id);

CREATE INDEX IF NOT EXISTS idx_transactions_boost_id ON transactions(boost_id);

COMMENT ON COLUMN transactions.boost_id IS 'FK boosts.id pour un paiement de boost publicitaire (paiement à l''acte) — NULL pour une transaction de commande';
COMMENT ON COLUMN transactions.type_paiement IS 'Type de paiement (texte libre) : paiement_complet, acompte, frais_livraison, solde_apres_livraison, complement, boost';

-- Note : type_paiement est une colonne VARCHAR(50) (ajoutée en migration 003), pas un enum Postgres —
-- la valeur 'boost' ne nécessite donc aucun ALTER TYPE, contrairement à statut_paiement.

-- ============================================
-- 3. Contrainte : une transaction référence une commande OU un boost, jamais les deux ni aucun
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_commande_ou_boost'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT chk_transactions_commande_ou_boost
            CHECK (num_nonnulls(commande_id, boost_id) = 1);
    END IF;
END $$;

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'boost_id'
    ) THEN
        RAISE NOTICE 'Migration 020 réussie : colonne transactions.boost_id présente';
    ELSE
        RAISE EXCEPTION 'Migration 020 échouée : colonne boost_id absente';
    END IF;
END $$;
