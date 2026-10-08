-- Migration: Pays du visiteur fiable malgré les VPN
-- Le fuseau horaire du navigateur (non modifié par un VPN) donne le pays ;
-- l'IP ne sert plus qu'à la ville (si cohérente) et à détecter un VPN.

ALTER TABLE vues_tracking
ADD COLUMN IF NOT EXISTS fuseau VARCHAR(64),
ADD COLUMN IF NOT EXISTS pays_ip VARCHAR(100),
ADD COLUMN IF NOT EXISTS via_vpn BOOLEAN;

COMMENT ON COLUMN vues_tracking.fuseau IS 'Fuseau horaire IANA du navigateur (ex. Africa/Libreville)';
COMMENT ON COLUMN vues_tracking.pays_ip IS 'Pays brut résolu par géolocalisation IP (celui du VPN le cas échéant)';
COMMENT ON COLUMN vues_tracking.via_vpn IS 'Vrai si le pays de l''IP diffère du pays du fuseau, ou si l''IP est un proxy connu';

-- ============================================
-- ENREGISTRER_VUE : 11 PARAMÈTRES
-- ============================================

DROP FUNCTION IF EXISTS enregistrer_vue(type_entite_vue, integer, varchar, text, text, varchar, varchar, varchar, varchar);

CREATE OR REPLACE FUNCTION enregistrer_vue(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER,
    p_ip_address VARCHAR(45),
    p_user_agent TEXT DEFAULT NULL,
    p_referer TEXT DEFAULT NULL,
    p_pays VARCHAR(100) DEFAULT NULL,
    p_ville VARCHAR(100) DEFAULT NULL,
    p_source VARCHAR(20) DEFAULT NULL,
    p_appareil VARCHAR(20) DEFAULT NULL,
    p_fuseau VARCHAR(64) DEFAULT NULL,
    p_pays_ip VARCHAR(100) DEFAULT NULL,
    p_via_vpn BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_nouvelle_vue BOOLEAN := FALSE;
BEGIN
    INSERT INTO vues_tracking (type_entite, entite_id, ip_address, user_agent, referer, pays, ville, source, appareil, fuseau, pays_ip, via_vpn)
    VALUES (p_type_entite, p_entite_id, p_ip_address, p_user_agent, p_referer, p_pays, p_ville, p_source, p_appareil, p_fuseau, p_pays_ip, p_via_vpn)
    ON CONFLICT (type_entite, entite_id, ip_address, date_vue_jour) DO NOTHING;

    IF FOUND THEN
        v_nouvelle_vue := TRUE;

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

COMMENT ON FUNCTION enregistrer_vue IS 'Enregistre une vue unique du jour (géo, source, appareil, fuseau, VPN) et incrémente nombre_vues';

-- ============================================
-- DIMENSION VPN DANS LES AGRÉGATS
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'statistiques_audience_jour'::regclass
          AND conname = 'statistiques_audience_jour_dimension_check'
    ) THEN
        ALTER TABLE statistiques_audience_jour DROP CONSTRAINT statistiques_audience_jour_dimension_check;
    END IF;

    ALTER TABLE statistiques_audience_jour
    ADD CONSTRAINT statistiques_audience_jour_dimension_check
    CHECK (dimension IN ('pays', 'ville', 'source', 'appareil', 'vpn'));
END $$;

CREATE OR REPLACE FUNCTION agreger_statistiques_jour(p_jour DATE)
RETURNS INT AS $$
DECLARE
    v_lignes INT := 0;
BEGIN
    INSERT INTO statistiques_vues_jour (jour, type_entite, entite_id, boutique_id, vues, visiteurs)
    SELECT
        p_jour,
        v.type_entite,
        v.entite_id,
        CASE
            WHEN v.type_entite = 'boutique' THEN v.entite_id
            ELSE p.boutique_id
        END,
        COUNT(*)::INT,
        COUNT(DISTINCT v.ip_address)::INT
    FROM vues_tracking v
    LEFT JOIN produits p ON v.type_entite = 'produit' AND p.id = v.entite_id
    WHERE (v.date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
      AND (
        v.type_entite = 'boutique'
        OR p.boutique_id IS NOT NULL
      )
    GROUP BY v.type_entite, v.entite_id, 4
    ON CONFLICT (jour, type_entite, entite_id) DO UPDATE SET
        boutique_id = EXCLUDED.boutique_id,
        vues = EXCLUDED.vues,
        visiteurs = EXCLUDED.visiteurs;

    GET DIAGNOSTICS v_lignes = ROW_COUNT;

    INSERT INTO statistiques_audience_jour (jour, dimension, valeur, vues, visiteurs)
    SELECT p_jour, dimension, valeur, COUNT(*)::INT, COUNT(DISTINCT ip_address)::INT
    FROM (
        SELECT 'pays'::varchar AS dimension, COALESCE(NULLIF(trim(pays), ''), 'inconnu') AS valeur, ip_address
        FROM vues_tracking
        WHERE (date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
        UNION ALL
        SELECT 'ville', COALESCE(NULLIF(trim(ville), ''), 'inconnu'), ip_address
        FROM vues_tracking
        WHERE (date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
        UNION ALL
        SELECT 'source', COALESCE(NULLIF(trim(source), ''), 'inconnu'), ip_address
        FROM vues_tracking
        WHERE (date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
        UNION ALL
        SELECT 'appareil', COALESCE(NULLIF(trim(appareil), ''), 'inconnu'), ip_address
        FROM vues_tracking
        WHERE (date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
        UNION ALL
        SELECT 'vpn', CASE WHEN via_vpn IS NULL THEN 'inconnu' WHEN via_vpn THEN 'oui' ELSE 'non' END, ip_address
        FROM vues_tracking
        WHERE (date_vue AT TIME ZONE 'Africa/Libreville')::date = p_jour
    ) brut
    GROUP BY dimension, valeur
    ON CONFLICT (jour, dimension, valeur) DO UPDATE SET
        vues = EXCLUDED.vues,
        visiteurs = EXCLUDED.visiteurs;

    RETURN v_lignes;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION agreger_statistiques_jour IS 'Agrège les vues d''un jour (fuseau Africa/Libreville), dimension vpn comprise. Idempotente.';
