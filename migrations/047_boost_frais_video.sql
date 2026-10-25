-- ============================================================================
-- Migration 047 : frais vidéo des boosts Meta (KOR-145)
-- ============================================================================
-- Une publicité vidéo mobilise du stockage (R2) et du traitement. Le frais vidéo est un montant
-- fixe, inclus dans le total payé par le vendeur, déduit avant la commission (qui ne porte que sur
-- le budget média). Il est figé sur le boost à la soumission, comme la commission.
-- Remboursement : conservé seulement si la publicité a réellement diffusé (dépense > 0).
-- Les boosts existants (images) gardent 0. Idempotente.
-- ============================================================================

ALTER TABLE boosts ADD COLUMN IF NOT EXISTS frais_video_fcfa INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_frais_video_positif') THEN
        ALTER TABLE boosts ADD CONSTRAINT boosts_frais_video_positif
            CHECK (frais_video_fcfa >= 0 AND frais_video_fcfa <= total_fcfa);
    END IF;
END $$;

COMMENT ON COLUMN boosts.frais_video_fcfa IS 'Frais fixe d''une créa vidéo (figé à la soumission, inclus dans total_fcfa, déduit avant la commission)';

INSERT INTO boost_parametres (cle, valeur) VALUES ('frais_video_fcfa', '1000')
ON CONFLICT (cle) DO NOTHING;
