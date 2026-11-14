-- ============================================================================
-- Migration 048 : livraison automatique des commandes confirmées
-- ============================================================================
-- Une commande restée « confirmée » passe automatiquement en « livrée » 10 jours après sa
-- confirmation (cron GET /cron/livraison-auto). Le vendeur est prévenu par e-mail 2 fois avant
-- (J+7 puis J+9). Ces colonnes comptent les rappels déjà envoyés pour ne jamais en envoyer deux
-- fois le même, même si le cron est appelé plusieurs fois. Idempotente.
-- ============================================================================

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS rappels_livraison_auto SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_dernier_rappel_livraison_auto TIMESTAMPTZ;

COMMENT ON COLUMN commandes.rappels_livraison_auto IS 'Nombre d''e-mails de rappel envoyés au vendeur avant le passage automatique en livrée (0 à 2)';
COMMENT ON COLUMN commandes.date_dernier_rappel_livraison_auto IS 'Date du dernier rappel de livraison automatique envoyé au vendeur';

-- Sert au cron : commandes confirmées à examiner, par date de confirmation
CREATE INDEX IF NOT EXISTS idx_commandes_livraison_auto
    ON commandes (date_confirmation)
    WHERE statut = 'confirmee';
