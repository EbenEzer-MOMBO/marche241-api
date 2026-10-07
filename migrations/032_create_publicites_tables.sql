-- Migration: 032
-- Description: Publicité interne (bannières sponsorisées sur les pages publiques Marché 241).
-- Annonceurs vendeurs (paiement eBilling à l'acte) ou externes (saisis par l'équipe, paiement hors plateforme).
-- Vente à la semaine calendaire (lundi → dimanche, heure de Libreville), un annonceur par créneau et par semaine :
-- l'exclusivité est garantie par l'index unique de publicite_reservations. Cf. PLAN_PUB_INTERNE.md.
-- Idempotente.

-- ============================================
-- 1. Types énumérés
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'formule_publicite') THEN
        CREATE TYPE formule_publicite AS ENUM ('categorie', 'accueil', 'premium');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_publicite') THEN
        CREATE TYPE statut_publicite AS ENUM (
            'brouillon',              -- en cours de saisie par le vendeur
            'en_attente_paiement',    -- semaines réservées, paiement eBilling non confirmé
            'en_attente_validation',  -- payée, dans la file de revue de l'équipe
            'refusee',                -- refusée par l'équipe (semaines libérées, remboursement)
            'programmee',             -- validée, diffusion à venir
            'active',                 -- en diffusion
            'terminee',               -- dernière semaine écoulée (bilan)
            'annulee'                 -- annulée par l'équipe (semaines futures libérées)
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_annonceur_publicite') THEN
        CREATE TYPE type_annonceur_publicite AS ENUM ('vendeur', 'externe');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creneau_publicite') THEN
        CREATE TYPE creneau_publicite AS ENUM ('accueil', 'pages', 'categorie');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_interaction_publicite') THEN
        CREATE TYPE type_interaction_publicite AS ENUM ('affichage', 'clic');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mode_paiement_publicite') THEN
        CREATE TYPE mode_paiement_publicite AS ENUM ('ebilling', 'hors_plateforme', 'offert');
    END IF;
END $$;

-- ============================================
-- 2. Table publicites
-- ============================================

CREATE TABLE IF NOT EXISTS publicites (
    id SERIAL PRIMARY KEY,
    type_annonceur type_annonceur_publicite NOT NULL DEFAULT 'vendeur',
    boutique_id INTEGER NULL REFERENCES boutiques(id),
    vendeur_id INTEGER NULL REFERENCES vendeurs(id),
    annonceur_nom VARCHAR(120) NOT NULL,
    annonceur_contact VARCHAR(160) NULL,

    formule formule_publicite NOT NULL DEFAULT 'accueil',
    categorie_id INTEGER NULL REFERENCES categories(id),
    statut statut_publicite NOT NULL DEFAULT 'brouillon',

    -- Planning : semaines calendaires consécutives à partir d'un lundi
    semaine_debut DATE NULL,
    nb_semaines INTEGER NOT NULL DEFAULT 1,
    semaines_offertes INTEGER NOT NULL DEFAULT 0,
    date_debut TIMESTAMPTZ NULL,
    date_fin TIMESTAMPTZ NULL,

    -- Créa
    image_url TEXT NULL,
    image_mobile_url TEXT NULL,
    texte_alternatif VARCHAR(140) NULL,
    cible_type VARCHAR(20) NULL,              -- vendeur : 'boutique' | 'produit'
    produit_id INTEGER NULL REFERENCES produits(id) ON DELETE SET NULL,
    url_destination TEXT NULL,

    -- Montants (FCFA entiers), figés à la soumission
    prix_semaine_fcfa INTEGER NOT NULL DEFAULT 0,
    remise_fcfa INTEGER NOT NULL DEFAULT 0,
    frais_encaissement_fcfa INTEGER NOT NULL DEFAULT 0,
    total_fcfa INTEGER NOT NULL DEFAULT 0,
    mode_paiement mode_paiement_publicite NOT NULL DEFAULT 'ebilling',
    reference_paiement_externe VARCHAR(120) NULL,

    -- Revue Marché 241
    note_revue TEXT NULL,
    valide_par VARCHAR(120) NULL,
    date_validation TIMESTAMPTZ NULL,
    publication_reseaux_faite BOOLEAN NOT NULL DEFAULT FALSE,

    -- Remboursement (traité manuellement par versement, comme les boosts)
    statut_remboursement statut_remboursement_boost NOT NULL DEFAULT 'aucun',
    montant_a_rembourser_fcfa INTEGER NOT NULL DEFAULT 0,
    date_remboursement TIMESTAMPTZ NULL,
    note_remboursement TEXT NULL,

    date_soumission TIMESTAMPTZ NULL,
    date_paiement TIMESTAMPTZ NULL,
    date_cloture TIMESTAMPTZ NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_publicites_vendeur CHECK (type_annonceur <> 'vendeur' OR (boutique_id IS NOT NULL AND vendeur_id IS NOT NULL)),
    CONSTRAINT chk_publicites_categorie CHECK (formule <> 'categorie' OR categorie_id IS NOT NULL OR statut = 'brouillon'),
    CONSTRAINT chk_publicites_semaines CHECK (nb_semaines BETWEEN 1 AND 52 AND semaines_offertes >= 0),
    CONSTRAINT chk_publicites_lundi CHECK (semaine_debut IS NULL OR EXTRACT(ISODOW FROM semaine_debut) = 1),
    CONSTRAINT chk_publicites_cible CHECK (cible_type IS NULL OR cible_type IN ('boutique', 'produit')),
    CONSTRAINT chk_publicites_montants CHECK (
        prix_semaine_fcfa >= 0 AND remise_fcfa >= 0 AND frais_encaissement_fcfa >= 0
        AND total_fcfa >= 0 AND montant_a_rembourser_fcfa >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_publicites_boutique_id ON publicites(boutique_id);
CREATE INDEX IF NOT EXISTS idx_publicites_statut ON publicites(statut);
CREATE INDEX IF NOT EXISTS idx_publicites_dates ON publicites(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_publicites_remboursement ON publicites(statut_remboursement)
    WHERE statut_remboursement = 'a_rembourser';

COMMENT ON TABLE publicites IS 'Bannières sponsorisées sur les pages publiques Marché 241 (vente à la semaine, un annonceur par créneau)';
COMMENT ON COLUMN publicites.total_fcfa IS 'Montant payé = prix_semaine_fcfa × nb_semaines − remise_fcfa (frais d''encaissement inclus)';
COMMENT ON COLUMN publicites.semaines_offertes IS 'Semaines ajoutées gratuitement par l''équipe (garantie d''affichages), comprises dans nb_semaines';

-- ============================================
-- 3. Réservations (exclusivité)
-- ============================================

CREATE TABLE IF NOT EXISTS publicite_reservations (
    id SERIAL PRIMARY KEY,
    publicite_id INTEGER NOT NULL REFERENCES publicites(id) ON DELETE CASCADE,
    creneau creneau_publicite NOT NULL,
    categorie_id INTEGER NULL REFERENCES categories(id),
    semaine DATE NOT NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_reservation_lundi CHECK (EXTRACT(ISODOW FROM semaine) = 1),
    CONSTRAINT chk_reservation_categorie CHECK ((creneau = 'categorie') = (categorie_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_publicite_reservation_creneau
    ON publicite_reservations (creneau, COALESCE(categorie_id, 0), semaine);
CREATE INDEX IF NOT EXISTS idx_publicite_reservations_publicite ON publicite_reservations(publicite_id);

COMMENT ON TABLE publicite_reservations IS 'Une ligne par créneau et par semaine occupés ; l''index unique interdit deux annonceurs sur le même créneau la même semaine';

-- ============================================
-- 4. Interactions (affichages et clics)
-- ============================================

CREATE TABLE IF NOT EXISTS publicite_interactions (
    id BIGSERIAL PRIMARY KEY,
    publicite_id INTEGER NOT NULL REFERENCES publicites(id) ON DELETE CASCADE,
    type type_interaction_publicite NOT NULL,
    page VARCHAR(30) NOT NULL,
    ip_hash VARCHAR(64) NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicite_interactions_publicite ON publicite_interactions(publicite_id, type);
CREATE INDEX IF NOT EXISTS idx_publicite_interactions_date ON publicite_interactions(date_creation);

-- ============================================
-- 5. Journal d'événements (audit)
-- ============================================

CREATE TABLE IF NOT EXISTS publicite_evenements (
    id SERIAL PRIMARY KEY,
    publicite_id INTEGER NOT NULL REFERENCES publicites(id) ON DELETE CASCADE,
    type_evenement VARCHAR(50) NOT NULL,
    acteur VARCHAR(30) NOT NULL DEFAULT 'systeme', -- vendeur | admin | systeme
    donnees JSONB NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicite_evenements_publicite ON publicite_evenements(publicite_id);

-- ============================================
-- 6. Paramètres (clé/valeur, édités depuis le back-office)
-- ============================================

CREATE TABLE IF NOT EXISTS publicite_parametres (
    cle VARCHAR(80) PRIMARY KEY,
    valeur TEXT NOT NULL,
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO publicite_parametres (cle, valeur) VALUES
    ('tarifs', '{"categorie":1500,"accueil":3000,"premium":6000}'),
    ('remise_4_pour_3', 'true'),
    ('semaines_max', '12'),
    ('semaines_avance_max', '12'),
    ('garantie_affichages', '{"categorie":30,"accueil":100,"premium":200}'),
    ('eligibilite', 'verifiees'),
    ('frais_encaissement_bps', '250'),
    ('delai_paiement_minutes', '120'),
    ('plateforme_active', 'false'),
    ('kill_switch', 'false')
ON CONFLICT (cle) DO NOTHING;

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'publicites')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'publicite_reservations')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'publicite_interactions')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'publicite_evenements')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'publicite_parametres') THEN
        RAISE NOTICE 'Migration 032 réussie : tables publicites, publicite_reservations, publicite_interactions, publicite_evenements, publicite_parametres';
    ELSE
        RAISE EXCEPTION 'Migration 032 échouée : une ou plusieurs tables sont absentes';
    END IF;
END $$;
