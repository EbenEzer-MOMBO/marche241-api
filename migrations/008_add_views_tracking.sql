-- Migration: Système de tracking des vues pour boutiques et produits
-- Date: 2025-11-28
-- Description: Crée une table pour enregistrer les vues uniques par IP et ajoute les compteurs de vues

-- ============================================
-- TABLE DE TRACKING DES VUES
-- ============================================

-- Créer un type enum pour le type d'entité
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_entite_vue') THEN
        CREATE TYPE type_entite_vue AS ENUM ('boutique', 'produit');
    END IF;
END $$;

-- Créer la table de tracking des vues
CREATE TABLE IF NOT EXISTS vues_tracking (
    id SERIAL PRIMARY KEY,
    type_entite type_entite_vue NOT NULL,
    entite_id INTEGER NOT NULL,
    ip_address VARCHAR(45) NOT NULL, -- Supporte IPv4 et IPv6
    user_agent TEXT,
    referer TEXT,
    date_vue TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_vue_jour DATE DEFAULT CURRENT_DATE -- Date du jour (sans heure) pour l'unicité
);

-- Trigger pour s'assurer que date_vue_jour est toujours synchronisé avec date_vue
CREATE OR REPLACE FUNCTION set_date_vue_jour()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_vue_jour := NEW.date_vue::date;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_date_vue_jour ON vues_tracking;
CREATE TRIGGER trigger_set_date_vue_jour
    BEFORE INSERT OR UPDATE ON vues_tracking
    FOR EACH ROW
    EXECUTE FUNCTION set_date_vue_jour();

-- Index unique pour garantir une seule vue par IP par entité par jour
CREATE UNIQUE INDEX IF NOT EXISTS unique_vue_par_jour 
ON vues_tracking (type_entite, entite_id, ip_address, date_vue_jour);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_vues_tracking_type_entite ON vues_tracking(type_entite);
CREATE INDEX IF NOT EXISTS idx_vues_tracking_entite_id ON vues_tracking(entite_id);
CREATE INDEX IF NOT EXISTS idx_vues_tracking_date ON vues_tracking(date_vue);
CREATE INDEX IF NOT EXISTS idx_vues_tracking_ip ON vues_tracking(ip_address);

-- Index composite pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_vues_tracking_entite ON vues_tracking(type_entite, entite_id);

-- Commentaires
COMMENT ON TABLE vues_tracking IS 'Table de tracking des vues uniques pour boutiques et produits';
COMMENT ON COLUMN vues_tracking.type_entite IS 'Type d''entité: boutique ou produit';
COMMENT ON COLUMN vues_tracking.entite_id IS 'ID de la boutique ou du produit';
COMMENT ON COLUMN vues_tracking.ip_address IS 'Adresse IP du visiteur (IPv4 ou IPv6)';
COMMENT ON COLUMN vues_tracking.user_agent IS 'User-Agent du navigateur';
COMMENT ON COLUMN vues_tracking.referer IS 'Page de provenance';
COMMENT ON COLUMN vues_tracking.date_vue IS 'Date et heure de la vue';

-- ============================================
-- AJOUT DU COMPTEUR DE VUES AUX BOUTIQUES
-- ============================================

ALTER TABLE boutiques
ADD COLUMN IF NOT EXISTS nombre_vues INTEGER DEFAULT 0;

COMMENT ON COLUMN boutiques.nombre_vues IS 'Nombre total de vues uniques de la boutique';

-- ============================================
-- AJOUT DU COMPTEUR DE VUES AUX PRODUITS
-- ============================================

ALTER TABLE produits
ADD COLUMN IF NOT EXISTS nombre_vues INTEGER DEFAULT 0;

COMMENT ON COLUMN produits.nombre_vues IS 'Nombre total de vues uniques du produit';

-- ============================================
-- FONCTION POUR ENREGISTRER UNE VUE
-- ============================================

CREATE OR REPLACE FUNCTION enregistrer_vue(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER,
    p_ip_address VARCHAR(45),
    p_user_agent TEXT DEFAULT NULL,
    p_referer TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_nouvelle_vue BOOLEAN := FALSE;
BEGIN
    -- Tenter d'insérer la vue (ignorera si déjà existante pour aujourd'hui grâce à l'index unique)
    INSERT INTO vues_tracking (type_entite, entite_id, ip_address, user_agent, referer)
    VALUES (p_type_entite, p_entite_id, p_ip_address, p_user_agent, p_referer)
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

COMMENT ON FUNCTION enregistrer_vue IS 'Enregistre une vue unique et incrémente le compteur si c''est une nouvelle vue du jour';

-- ============================================
-- FONCTION POUR OBTENIR LES STATISTIQUES DE VUES
-- ============================================

CREATE OR REPLACE FUNCTION stats_vues(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER
)
RETURNS TABLE (
    vues_totales BIGINT,
    vues_aujourd_hui BIGINT,
    vues_7_jours BIGINT,
    vues_30_jours BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as vues_totales,
        COUNT(*) FILTER (WHERE date_vue::date = CURRENT_DATE)::BIGINT as vues_aujourd_hui,
        COUNT(*) FILTER (WHERE date_vue >= NOW() - INTERVAL '7 days')::BIGINT as vues_7_jours,
        COUNT(*) FILTER (WHERE date_vue >= NOW() - INTERVAL '30 days')::BIGINT as vues_30_jours
    FROM vues_tracking
    WHERE type_entite = p_type_entite AND entite_id = p_entite_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION stats_vues IS 'Retourne les statistiques de vues pour une entité donnée';

-- ============================================
-- NETTOYAGE DES ANCIENNES VUES (optionnel)
-- ============================================

-- Fonction pour nettoyer les vues de plus de 90 jours (à appeler périodiquement)
CREATE OR REPLACE FUNCTION nettoyer_anciennes_vues(p_jours_retention INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM vues_tracking
    WHERE date_vue < NOW() - (p_jours_retention || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION nettoyer_anciennes_vues IS 'Supprime les vues plus anciennes que le nombre de jours spécifié';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    -- Vérifier la table vues_tracking
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vues_tracking') THEN
        RAISE NOTICE 'Table vues_tracking créée avec succès';
    ELSE
        RAISE EXCEPTION 'Erreur: Table vues_tracking non créée';
    END IF;
    
    -- Vérifier la colonne nombre_vues sur boutiques
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boutiques' AND column_name = 'nombre_vues') THEN
        RAISE NOTICE 'Colonne nombre_vues ajoutée à boutiques';
    ELSE
        RAISE EXCEPTION 'Erreur: Colonne nombre_vues non ajoutée à boutiques';
    END IF;
    
    -- Vérifier la colonne nombre_vues sur produits
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produits' AND column_name = 'nombre_vues') THEN
        RAISE NOTICE 'Colonne nombre_vues ajoutée à produits';
    ELSE
        RAISE EXCEPTION 'Erreur: Colonne nombre_vues non ajoutée à produits';
    END IF;
    
    RAISE NOTICE 'Migration 008_add_views_tracking terminée avec succès';
END $$;
