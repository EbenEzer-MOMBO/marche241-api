-- Migration: 033
-- Description: Paiement à l'acte des publicités internes via la table transactions (eBilling, polling,
-- réconciliation), sur le modèle des boosts (027). Une transaction référence exactement une commande,
-- un boost ou une publicité. type_paiement est un VARCHAR : la valeur 'publicite' ne nécessite pas d'ALTER TYPE.
-- Idempotente.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS publicite_id INTEGER NULL REFERENCES publicites(id);

CREATE INDEX IF NOT EXISTS idx_transactions_publicite_id ON transactions(publicite_id) WHERE publicite_id IS NOT NULL;

COMMENT ON COLUMN transactions.publicite_id IS 'Publicité interne payée par cette transaction (type_paiement = publicite) ; NULL sinon';

-- La contrainte de 027 n'accepte que commande ou boost : elle est remplacée.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_commande_ou_boost;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_une_cible') THEN
        ALTER TABLE transactions
            ADD CONSTRAINT chk_transactions_une_cible
            CHECK (num_nonnulls(commande_id, boost_id, publicite_id) = 1);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'publicite_id'
    ) AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_une_cible') THEN
        RAISE NOTICE 'Migration 033 réussie : transactions.publicite_id présente, contrainte chk_transactions_une_cible';
    ELSE
        RAISE EXCEPTION 'Migration 033 échouée';
    END IF;
END $$;
