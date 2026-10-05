-- Migration: 027
-- Description: Paiement à l'acte des boosts via la table transactions existante (eBilling, polling,
-- réconciliation). Une transaction référence soit une commande, soit un boost.
-- type_paiement est un VARCHAR (migration 003) : la valeur 'boost' ne nécessite pas d'ALTER TYPE.
-- Les requêtes existantes qui font `JOIN commandes c ON c.id = t.commande_id` excluent naturellement
-- les transactions de boost (comportement voulu : elles ne sont ni des ventes ni des versements).
-- Idempotente.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'commande_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE transactions ALTER COLUMN commande_id DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS boost_id INTEGER NULL REFERENCES boosts(id);

CREATE INDEX IF NOT EXISTS idx_transactions_boost_id ON transactions(boost_id) WHERE boost_id IS NOT NULL;

COMMENT ON COLUMN transactions.boost_id IS 'Boost publicitaire payé par cette transaction (type_paiement = boost) ; NULL pour une transaction de commande';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_commande_ou_boost') THEN
        ALTER TABLE transactions
            ADD CONSTRAINT chk_transactions_commande_ou_boost
            CHECK (num_nonnulls(commande_id, boost_id) = 1);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'boost_id'
    ) THEN
        RAISE NOTICE 'Migration 027 réussie : transactions.boost_id présente';
    ELSE
        RAISE EXCEPTION 'Migration 027 échouée : colonne boost_id absente';
    END IF;
END $$;
