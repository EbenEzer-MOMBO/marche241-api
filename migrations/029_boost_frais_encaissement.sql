-- ============================================================================
-- Migration 029 : frais d'encaissement non remboursables (boost publicitaire)
-- ============================================================================
-- eBilling prélève un pourcentage sur chaque paiement. Ces frais ne sont plus
-- remboursés au vendeur en cas de refus, de rejet Meta ou de budget non dépensé.
-- Le montant est figé sur le boost à la soumission (comme la commission) :
-- les boosts déjà soumis gardent 0 (remboursement intégral, règle d'origine).
-- Idempotente.
-- ============================================================================

ALTER TABLE boosts ADD COLUMN IF NOT EXISTS frais_encaissement_fcfa INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_frais_encaissement_positif') THEN
        ALTER TABLE boosts ADD CONSTRAINT boosts_frais_encaissement_positif
            CHECK (frais_encaissement_fcfa >= 0 AND frais_encaissement_fcfa <= total_fcfa);
    END IF;
END $$;

COMMENT ON COLUMN boosts.frais_encaissement_fcfa IS 'Frais eBilling retenus sur tout remboursement (figés à la soumission, inclus dans total_fcfa)';

INSERT INTO boost_parametres (cle, valeur) VALUES ('frais_encaissement_bps', '250')
ON CONFLICT (cle) DO NOTHING;
