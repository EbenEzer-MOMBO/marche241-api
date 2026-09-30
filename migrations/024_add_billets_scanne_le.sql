-- Migration: Statut de scan des billets événement
-- Date: 2026-09-30
-- Description: Horodatage du contrôle d'un billet à l'entrée (NULL = non scanné).

ALTER TABLE billets ADD COLUMN IF NOT EXISTS scanne_le TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN billets.scanne_le IS 'Date du scan du billet à l''entrée de l''événement (NULL = non scanné)';
