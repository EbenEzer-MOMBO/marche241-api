-- Page Facebook du compte publicitaire associée à une boutique (vide = page Marché 241).
-- Le boost conserve un snapshot de la page réellement publiée.

ALTER TABLE boutiques ADD COLUMN IF NOT EXISTS meta_page_id VARCHAR(64);
ALTER TABLE boutiques ADD COLUMN IF NOT EXISTS meta_page_nom VARCHAR(200);

ALTER TABLE boosts ADD COLUMN IF NOT EXISTS meta_page_id VARCHAR(64);
ALTER TABLE boosts ADD COLUMN IF NOT EXISTS meta_page_nom VARCHAR(200);
ALTER TABLE boosts ADD COLUMN IF NOT EXISTS meta_instagram_id VARCHAR(64);
ALTER TABLE boosts ADD COLUMN IF NOT EXISTS meta_instagram_nom VARCHAR(200);

COMMENT ON COLUMN boutiques.meta_page_id IS 'Page Facebook du compte publicitaire qui porte les pubs de la boutique. NULL = page Marché 241 (meta_connexion).';
COMMENT ON COLUMN boosts.meta_page_id IS 'Snapshot de la Page Facebook utilisée à la publication. Indépendant d''un changement ultérieur sur la boutique.';
