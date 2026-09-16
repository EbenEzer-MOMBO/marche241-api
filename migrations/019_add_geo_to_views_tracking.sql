-- Migration: Ajout de la géolocalisation (pays/ville) au tracking des vues
-- Date: 2026-09-16
-- Description: Ajoute les colonnes pays/ville à vues_tracking, résolues côté
-- application à partir de l'IP via une librairie locale (geoip-lite), et une
-- fonction de statistiques agrégée par pays/ville.

-- ============================================
-- COLONNES GÉO SUR VUES_TRACKING
-- ============================================

ALTER TABLE vues_tracking
ADD COLUMN IF NOT EXISTS pays VARCHAR(100),
ADD COLUMN IF NOT EXISTS ville VARCHAR(100);

COMMENT ON COLUMN vues_tracking.pays IS 'Pays du visiteur, résolu par géolocalisation IP (approximatif, NULL si non résolu)';
COMMENT ON COLUMN vues_tracking.ville IS 'Ville du visiteur, résolue par géolocalisation IP (approximatif, NULL si non résolu)';

CREATE INDEX IF NOT EXISTS idx_vues_tracking_pays ON vues_tracking(pays);

-- ============================================
-- ENREGISTRER_VUE : ACCEPTE DÉSORMAIS PAYS/VILLE
-- ============================================

CREATE OR REPLACE FUNCTION enregistrer_vue(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER,
    p_ip_address VARCHAR(45),
    p_user_agent TEXT DEFAULT NULL,
    p_referer TEXT DEFAULT NULL,
    p_pays VARCHAR(100) DEFAULT NULL,
    p_ville VARCHAR(100) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_nouvelle_vue BOOLEAN := FALSE;
BEGIN
    -- Tenter d'insérer la vue (ignorera si déjà existante pour aujourd'hui grâce à l'index unique)
    INSERT INTO vues_tracking (type_entite, entite_id, ip_address, user_agent, referer, pays, ville)
    VALUES (p_type_entite, p_entite_id, p_ip_address, p_user_agent, p_referer, p_pays, p_ville)
    ON CONFLICT (type_entite, entite_id, ip_address, date_vue_jour) DO NOTHING;

    -- Vérifier si l'insertion a eu lieu
    IF FOUND THEN
        v_nouvelle_vue := TRUE;

        -- Incrémenter le compteur de vues selon le type d'entité
        IF p_type_entite = 'boutique' THEN
            UPDATE boutiques
            SET nombre_vues = COALESCE(nombre_vues, 0) + 1
            WHERE id = p_entite_id;
        ELSIF p_type_entite = 'produit' THEN
            UPDATE produits
            SET nombre_vues = COALESCE(nombre_vues, 0) + 1
            WHERE id = p_entite_id;
        END IF;
    END IF;

    RETURN v_nouvelle_vue;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enregistrer_vue IS 'Enregistre une vue unique (avec géolocalisation pays/ville optionnelle) et incrémente le compteur si c''est une nouvelle vue du jour';

-- ============================================
-- STATISTIQUES DE VUES PAR PAYS/VILLE
-- ============================================

CREATE OR REPLACE FUNCTION stats_vues_geo(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER,
    p_jours INTEGER DEFAULT 30
)
RETURNS TABLE (
    pays VARCHAR(100),
    ville VARCHAR(100),
    nombre_vues BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(vt.pays, 'Inconnu') as pays,
        COALESCE(vt.ville, 'Inconnue') as ville,
        COUNT(*)::BIGINT as nombre_vues
    FROM vues_tracking vt
    WHERE vt.type_entite = p_type_entite
      AND vt.entite_id = p_entite_id
      AND vt.date_vue >= NOW() - (p_jours || ' days')::INTERVAL
    GROUP BY COALESCE(vt.pays, 'Inconnu'), COALESCE(vt.ville, 'Inconnue')
    ORDER BY nombre_vues DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION stats_vues_geo IS 'Retourne la répartition des vues par pays/ville pour une entité, sur une période donnée (30 jours par défaut)';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vues_tracking' AND column_name = 'pays'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vues_tracking' AND column_name = 'ville'
    ) THEN
        RAISE NOTICE 'Migration réussie: colonnes pays/ville ajoutées à vues_tracking';
    ELSE
        RAISE EXCEPTION 'Migration échouée: colonnes pays/ville non ajoutées à vues_tracking';
    END IF;
END $$;
