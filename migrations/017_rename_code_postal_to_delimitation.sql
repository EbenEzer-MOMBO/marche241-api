-- Migration: Renommer code_postal en delimitation sur communes_livraison
-- Date: 2026-08-27
-- Description: Le champ code_postal n'a jamais servi de code postal en pratique :
-- le formulaire vendeur y stocke déjà une description libre de la zone
-- (quartiers inclus, limites géographiques...). On renomme la colonne pour
-- refléter l'usage réel et on élargit sa longueur à 100 caractères.

ALTER TABLE communes_livraison
RENAME COLUMN code_postal TO delimitation;

ALTER TABLE communes_livraison
ALTER COLUMN delimitation TYPE VARCHAR(100);

COMMENT ON COLUMN communes_livraison.delimitation IS 'Description libre de la zone de livraison (quartiers, limites géographiques...)';

-- Vérification
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'communes_livraison' AND column_name = 'delimitation';
