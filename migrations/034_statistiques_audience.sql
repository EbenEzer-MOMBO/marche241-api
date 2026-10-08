-- Migration: Fiabilisation du tracking d'audience
-- Colonnes source/appareil, agrégats journaliers permanents, normalisation des villes.

ALTER TABLE vues_tracking
ADD COLUMN IF NOT EXISTS source VARCHAR(20),
ADD COLUMN IF NOT EXISTS appareil VARCHAR(20);

COMMENT ON COLUMN vues_tracking.source IS 'Source d''acquisition: whatsapp, facebook, instagram, tiktok, google, direct, interne, autre';
COMMENT ON COLUMN vues_tracking.appareil IS 'Appareil du visiteur: android, ios, desktop, autre';

DROP FUNCTION IF EXISTS enregistrer_vue(type_entite_vue, integer, varchar, text, text, varchar, varchar);

CREATE OR REPLACE FUNCTION enregistrer_vue(
    p_type_entite type_entite_vue,
    p_entite_id INTEGER,
    p_ip_address VARCHAR(45),
    p_user_agent TEXT DEFAULT NULL,
    p_referer TEXT DEFAULT NULL,
    p_pays VARCHAR(100) DEFAULT NULL,
    p_ville VARCHAR(100) DEFAULT NULL,
    p_source VARCHAR(20) DEFAULT NULL,
    p_appareil VARCHAR(20) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_nouvelle_vue BOOLEAN := FALSE;
BEGIN
    INSERT INTO vues_tracking (type_entite, entite_id, ip_address, user_agent, referer, pays, ville, source, appareil)
    VALUES (p_type_entite, p_entite_id, p_ip_address, p_user_agent, p_referer, p_pays, p_ville, p_source, p_appareil)
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

COMMENT ON FUNCTION enregistrer_vue IS 'Enregistre une vue unique du jour (géo, source, appareil) et incrémente nombre_vues';

CREATE TABLE IF NOT EXISTS statistiques_vues_jour (
    jour DATE NOT NULL,
    type_entite type_entite_vue NOT NULL,
    entite_id INTEGER NOT NULL,
    boutique_id INTEGER NOT NULL,
    vues INTEGER NOT NULL,
    visiteurs INTEGER NOT NULL,
    PRIMARY KEY (jour, type_entite, entite_id)
);

CREATE INDEX IF NOT EXISTS idx_statistiques_vues_jour_boutique
ON statistiques_vues_jour (boutique_id, jour);

CREATE TABLE IF NOT EXISTS statistiques_audience_jour (
    jour DATE NOT NULL,
    dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('pays', 'ville', 'source', 'appareil')),
    valeur VARCHAR(100) NOT NULL,
    vues INTEGER NOT NULL,
    visiteurs INTEGER NOT NULL,
    PRIMARY KEY (jour, dimension, valeur)
);

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
    ) brut
    GROUP BY dimension, valeur
    ON CONFLICT (jour, dimension, valeur) DO UPDATE SET
        vues = EXCLUDED.vues,
        visiteurs = EXCLUDED.visiteurs;

    RETURN v_lignes;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION agreger_statistiques_jour IS 'Agrège les vues d''un jour (fuseau Africa/Libreville). Idempotente.';

CREATE OR REPLACE FUNCTION normaliser_ville(p_ville TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v TEXT;
BEGIN
    IF p_ville IS NULL THEN
        RETURN NULL;
    END IF;

    v := lower(btrim(p_ville));
    v := translate(v,
        'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
        'aaaaaaeeeeiiiiooooouuuuyycn');
    v := regexp_replace(v, '[-_]+', ' ', 'g');
    v := regexp_replace(v, '\s+', ' ', 'g');
    v := btrim(v);

    IF v = '' THEN
        RETURN '';
    END IF;

    IF v IN ('libreville', 'grand libreville', 'libreville centre', 'gabon libreville') THEN
        RETURN 'Libreville';
    ELSIF v = 'akanda' THEN
        RETURN 'Akanda';
    ELSIF v = 'owendo' THEN
        RETURN 'Owendo';
    ELSIF v = 'ntoum' THEN
        RETURN 'Ntoum';
    ELSIF v IN ('port gentil', 'portgentil') THEN
        RETURN 'Port-Gentil';
    ELSIF v = 'franceville' THEN
        RETURN 'Franceville';
    ELSIF v = 'oyem' THEN
        RETURN 'Oyem';
    ELSIF v = 'moanda' THEN
        RETURN 'Moanda';
    ELSIF v IN ('lambarene', 'lambaréné') THEN
        RETURN 'Lambaréné';
    ELSIF v = 'tchibanga' THEN
        RETURN 'Tchibanga';
    ELSIF v = 'makokou' THEN
        RETURN 'Makokou';
    ELSIF v = 'mouila' THEN
        RETURN 'Mouila';
    ELSIF v = 'bitam' THEN
        RETURN 'Bitam';
    ELSIF v = 'koulamoutou' THEN
        RETURN 'Koulamoutou';
    ELSIF v = 'retrait en magasin' THEN
        RETURN 'Retrait en magasin';
    ELSIF v = 'province' THEN
        RETURN 'Province';
    END IF;

    RETURN regexp_replace(btrim(p_ville), '\s+', ' ', 'g');
END;
$$;

COMMENT ON FUNCTION normaliser_ville IS 'Ramène une ville saisie vers le libellé canonique, sinon renvoie la valeur nettoyée';

-- Écriture des villes existantes : à valider sur une branche Neon avant la prod.
UPDATE boutiques
SET ville = normaliser_ville(ville)
WHERE ville IS DISTINCT FROM normaliser_ville(ville);
