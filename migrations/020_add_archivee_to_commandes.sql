-- Migration: Archivage réversible des commandes (MAR-35)
-- Date: 2026-09-16
-- Description: Permet au vendeur d'archiver une commande test (réversible),
-- sans la supprimer et sans fausser le statut métier existant. Une commande
-- archivée est exclue par défaut des listes/statistiques vendeur.

ALTER TABLE commandes
ADD COLUMN IF NOT EXISTS archivee BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN commandes.archivee IS 'Commande archivée par le vendeur (ex: commande de test) ; réversible, exclue par défaut des listes et statistiques';

CREATE INDEX IF NOT EXISTS idx_commandes_archivee ON commandes(archivee);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commandes' AND column_name = 'archivee'
    ) THEN
        RAISE NOTICE 'Migration réussie: colonne archivee ajoutée à commandes';
    ELSE
        RAISE EXCEPTION 'Migration échouée: colonne archivee non ajoutée à commandes';
    END IF;
END $$;
