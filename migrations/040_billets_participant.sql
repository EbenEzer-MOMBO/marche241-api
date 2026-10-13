-- Infos titulaire d'un billet nommé (nullable : événements existants / sans collecte)
ALTER TABLE billets
  ADD COLUMN IF NOT EXISTS participant_nom TEXT,
  ADD COLUMN IF NOT EXISTS participant_telephone TEXT,
  ADD COLUMN IF NOT EXISTS participant_profession TEXT,
  ADD COLUMN IF NOT EXISTS participant_email TEXT;
