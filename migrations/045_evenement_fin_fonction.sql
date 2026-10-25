-- Migration: Fin d'un événement (masquage public des événements terminés)
-- Date: 2026-10-25
-- Description: fonctions evenement_date_meta() et evenement_fin() utilisées par les requêtes publiques
--              de produits. Une saisie « AAAA-MM-JJTHH:mm[:ss] » sans fuseau est une heure du Gabon (UTC+1) ;
--              une date avec fuseau explicite est lue telle quelle ; toute valeur invalide donne NULL
--              (jamais d'erreur : une date mal formée ne doit pas casser les listes publiques).
--              La fin = date_fin si elle est postérieure au début, sinon début + 12 h (règle du scanner).

CREATE OR REPLACE FUNCTION evenement_date_meta(valeur TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF valeur ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$' THEN
        RETURN (valeur || '+01')::timestamptz;
    ELSIF valeur ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
        RETURN valeur::timestamptz;
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION evenement_fin(variants JSON)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
    SELECT CASE WHEN variants->>'type' = 'evenement' THEN
        COALESCE(
            CASE WHEN d.fin IS NOT NULL AND (d.debut IS NULL OR d.fin > d.debut) THEN d.fin END,
            d.debut + INTERVAL '12 hours'
        )
    END
    FROM (SELECT evenement_date_meta(variants->'meta'->>'date_debut') AS debut,
                 evenement_date_meta(variants->'meta'->>'date_fin') AS fin) d
$$;
