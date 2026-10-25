-- Boosts Meta : créa vidéo (KOR-145). Idempotent.
-- image_url reste la miniature exigée par Meta avec video_data.

ALTER TABLE boosts
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';

ALTER TABLE boosts
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE boosts
  ADD COLUMN IF NOT EXISTS video_duree_sec INTEGER;

ALTER TABLE boosts
  ADD COLUMN IF NOT EXISTS meta_video_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boosts_media_type_check'
  ) THEN
    ALTER TABLE boosts
      ADD CONSTRAINT boosts_media_type_check
      CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

COMMENT ON COLUMN boosts.media_type IS 'image | video — image_url est toujours la miniature';
COMMENT ON COLUMN boosts.video_url IS 'URL publique R2 de la vidéo (MP4/MOV)';
COMMENT ON COLUMN boosts.video_duree_sec IS 'Durée déclarée, 1 à 60 secondes';
COMMENT ON COLUMN boosts.meta_video_id IS 'Identifiant Meta advideos, pour reprise sans re-téléverser';
