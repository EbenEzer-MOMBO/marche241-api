-- Migration: 026
-- Description: Boost publicitaire Meta Ads (calqué sur boost_meta / Eventime Ads).
-- Paiement à l'acte (transaction eBilling liée via transactions.boost_id, cf. 027),
-- budget média + commission en bps, validation par l'équipe Marché 241 avant publication Meta,
-- remboursement manuel (versement) en cas de refus, rejet Meta ou reliquat à la clôture.
-- Idempotente.

-- ============================================
-- 0. Archivage de l'ancien schéma boost (branche cursor/boosts-*, ex-migrations 019/020)
-- ============================================
-- La base principale contient déjà des tables boosts / boost_evenements / boost_stats incompatibles
-- (colonnes forfait_code, prix_vendeur_fcfa…, statuts en_attente_revue, rejete…). Rien n'est supprimé :
-- les objets sont renommés en *_v0 pour que le nouveau schéma puisse être créé. La FK
-- transactions.boost_id est recréée vers la nouvelle table en 027.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'boosts' AND column_name = 'forfait_code'
    ) THEN
        IF EXISTS (SELECT 1 FROM transactions WHERE boost_id IS NOT NULL) THEN
            RAISE EXCEPTION 'Migration 026 : des transactions référencent l''ancien schéma boost, reprise manuelle nécessaire';
        END IF;

        ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_boost_id_fkey;

        ALTER TABLE IF EXISTS boost_stats RENAME TO boost_stats_v0;
        ALTER TABLE IF EXISTS boost_evenements RENAME TO boost_evenements_v0;
        ALTER TABLE boosts RENAME TO boosts_v0;

        ALTER INDEX IF EXISTS boosts_pkey RENAME TO boosts_v0_pkey;
        ALTER INDEX IF EXISTS boost_evenements_pkey RENAME TO boost_evenements_v0_pkey;
        ALTER INDEX IF EXISTS boost_stats_pkey RENAME TO boost_stats_v0_pkey;
        ALTER INDEX IF EXISTS idx_boosts_boutique_id RENAME TO idx_boosts_v0_boutique_id;
        ALTER INDEX IF EXISTS idx_boosts_vendeur_id RENAME TO idx_boosts_v0_vendeur_id;
        ALTER INDEX IF EXISTS idx_boosts_statut RENAME TO idx_boosts_v0_statut;
        ALTER INDEX IF EXISTS idx_boost_evenements_boost_id RENAME TO idx_boost_evenements_v0_boost_id;
        ALTER INDEX IF EXISTS idx_boost_stats_boost_id RENAME TO idx_boost_stats_v0_boost_id;

        ALTER SEQUENCE IF EXISTS boosts_id_seq RENAME TO boosts_v0_id_seq;
        ALTER SEQUENCE IF EXISTS boost_evenements_id_seq RENAME TO boost_evenements_v0_id_seq;
        ALTER SEQUENCE IF EXISTS boost_stats_id_seq RENAME TO boost_stats_v0_id_seq;

        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_boost') THEN
            ALTER TYPE statut_boost RENAME TO statut_boost_v0;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_boost') THEN
            ALTER TYPE type_boost RENAME TO type_boost_v0;
        END IF;

        RAISE NOTICE 'Migration 026 : ancien schéma boost archivé (boosts_v0, boost_evenements_v0, boost_stats_v0)';
    END IF;
END $$;

-- ============================================
-- 1. Types énumérés
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_boost') THEN
        CREATE TYPE statut_boost AS ENUM (
            'brouillon',              -- en cours de saisie par le vendeur (wizard)
            'en_attente_paiement',    -- soumis, transaction eBilling créée, paiement non confirmé
            'en_attente_validation',  -- payé, dans la file de revue de l'équipe Marché 241
            'refuse',                 -- refusé par l'équipe (remboursement total)
            'actif',                  -- publié sur Meta
            'en_pause',
            'termine',                -- clôturé (fin de période, budget épuisé ou clôture admin)
            'rejete_meta',            -- publicité refusée par la revue Meta (remboursement total)
            'erreur'                  -- échec de publication Meta, à republier
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'objectif_boost') THEN
        CREATE TYPE objectif_boost AS ENUM ('trafic', 'whatsapp', 'notoriete');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_cible_boost') THEN
        CREATE TYPE type_cible_boost AS ENUM ('boutique', 'produit');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_remboursement_boost') THEN
        CREATE TYPE statut_remboursement_boost AS ENUM ('aucun', 'a_rembourser', 'rembourse');
    END IF;
END $$;

-- ============================================
-- 2. Table boosts
-- ============================================

CREATE TABLE IF NOT EXISTS boosts (
    id SERIAL PRIMARY KEY,
    boutique_id INTEGER NOT NULL REFERENCES boutiques(id),
    vendeur_id INTEGER NOT NULL REFERENCES vendeurs(id),
    type_cible type_cible_boost NOT NULL DEFAULT 'boutique',
    produit_id INTEGER NULL REFERENCES produits(id) ON DELETE SET NULL,
    objectif objectif_boost NOT NULL DEFAULT 'trafic',
    statut statut_boost NOT NULL DEFAULT 'brouillon',
    nom VARCHAR(120) NOT NULL,

    -- Montants (FCFA entiers), figés à la soumission
    budget_media_fcfa INTEGER NOT NULL DEFAULT 0,
    commission_bps INTEGER NOT NULL DEFAULT 0,
    commission_fcfa INTEGER NOT NULL DEFAULT 0,
    tva_fcfa INTEGER NOT NULL DEFAULT 0,
    total_fcfa INTEGER NOT NULL DEFAULT 0,
    depense_fcfa INTEGER NOT NULL DEFAULT 0,

    -- Planning
    duree_jours INTEGER NOT NULL DEFAULT 7,
    date_debut TIMESTAMPTZ NULL,
    date_fin TIMESTAMPTZ NULL,

    -- Ciblage (pays, villes, age_min, age_max, sexes, langues, interets, etape_wizard)
    ciblage JSONB NOT NULL DEFAULT '{}'::jsonb,
    url_destination TEXT NULL,
    whatsapp_e164 VARCHAR(20) NULL,

    -- Créa
    titre VARCHAR(80) NULL,
    texte_principal TEXT NULL,
    description VARCHAR(200) NULL,
    image_url TEXT NULL,
    cta VARCHAR(40) NOT NULL DEFAULT 'LEARN_MORE',

    -- Revue Marché 241
    note_revue TEXT NULL,
    conformite JSONB NULL,
    valide_par VARCHAR(120) NULL,
    date_validation TIMESTAMPTZ NULL,

    -- Meta
    meta_campaign_id VARCHAR(100) NULL,
    meta_adset_id VARCHAR(100) NULL,
    meta_ad_id VARCHAR(100) NULL,
    meta_statut_effectif VARCHAR(50) NULL,
    meta_derniere_erreur TEXT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    date_derniere_synchro TIMESTAMPTZ NULL,

    -- Remboursement (paiement à l'acte : traité manuellement par versement)
    statut_remboursement statut_remboursement_boost NOT NULL DEFAULT 'aucun',
    montant_a_rembourser_fcfa INTEGER NOT NULL DEFAULT 0,
    date_remboursement TIMESTAMPTZ NULL,
    note_remboursement TEXT NULL,

    date_soumission TIMESTAMPTZ NULL,
    date_paiement TIMESTAMPTZ NULL,
    date_cloture TIMESTAMPTZ NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_boosts_montants_positifs CHECK (
        budget_media_fcfa >= 0 AND commission_fcfa >= 0 AND tva_fcfa >= 0
        AND total_fcfa >= 0 AND depense_fcfa >= 0 AND montant_a_rembourser_fcfa >= 0
    ),
    CONSTRAINT chk_boosts_duree CHECK (duree_jours BETWEEN 1 AND 60),
    CONSTRAINT chk_boosts_produit CHECK (type_cible <> 'produit' OR produit_id IS NOT NULL OR statut = 'brouillon')
);

CREATE INDEX IF NOT EXISTS idx_boosts_boutique_id ON boosts(boutique_id);
CREATE INDEX IF NOT EXISTS idx_boosts_vendeur_id ON boosts(vendeur_id);
CREATE INDEX IF NOT EXISTS idx_boosts_statut ON boosts(statut);
CREATE INDEX IF NOT EXISTS idx_boosts_remboursement ON boosts(statut_remboursement)
    WHERE statut_remboursement = 'a_rembourser';

COMMENT ON TABLE boosts IS 'Boosts publicitaires Meta Ads (paiement à l''acte, revue Marché 241, publication Marketing API)';
COMMENT ON COLUMN boosts.total_fcfa IS 'Montant payé par le vendeur = budget_media_fcfa + commission_fcfa + tva_fcfa';
COMMENT ON COLUMN boosts.montant_a_rembourser_fcfa IS 'Calculé par l''API (refus, rejet Meta ou reliquat) ; remboursé manuellement par versement';

-- ============================================
-- 3. Statistiques quotidiennes (Insights Meta)
-- ============================================

CREATE TABLE IF NOT EXISTS boost_insights_jour (
    id SERIAL PRIMARY KEY,
    boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    depense_fcfa INTEGER NOT NULL DEFAULT 0,
    depense_devise NUMERIC(14, 2) NOT NULL DEFAULT 0, -- dépense brute dans la devise du compte pub
    impressions INTEGER NOT NULL DEFAULT 0,
    portee INTEGER NOT NULL DEFAULT 0,
    clics INTEGER NOT NULL DEFAULT 0,
    messages INTEGER NOT NULL DEFAULT 0,
    brut JSONB NULL,
    date_maj TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_boost_insights_jour UNIQUE (boost_id, date)
);

-- ============================================
-- 4. Journal d'événements (audit)
-- ============================================

CREATE TABLE IF NOT EXISTS boost_evenements (
    id SERIAL PRIMARY KEY,
    boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
    type_evenement VARCHAR(50) NOT NULL,
    acteur VARCHAR(30) NOT NULL DEFAULT 'systeme', -- vendeur | admin | systeme | meta
    donnees JSONB NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boost_evenements_boost_id ON boost_evenements(boost_id);

-- ============================================
-- 5. Paramètres (clé/valeur, édités depuis le back-office)
-- ============================================

CREATE TABLE IF NOT EXISTS boost_parametres (
    cle VARCHAR(80) PRIMARY KEY,
    valeur TEXT NOT NULL,
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO boost_parametres (cle, valeur) VALUES
    ('commission_bps', '2000'),
    ('commission_min_fcfa', '1000'),
    ('tva_bps', '0'),
    ('total_min_fcfa', '3000'),
    ('total_max_fcfa', '500000'),
    ('duree_min_jours', '3'),
    ('duree_max_jours', '14'),
    ('packs', '[{"code":"decouverte","nom":"Découverte","total_fcfa":3000,"duree_jours":3},{"code":"standard","nom":"Standard","total_fcfa":7500,"duree_jours":5},{"code":"pro","nom":"Boost Pro","total_fcfa":15000,"duree_jours":7},{"code":"max","nom":"Boost Max","total_fcfa":30000,"duree_jours":10}]'),
    ('fx_xaf_par_usd', '600'),
    ('cpm_min_fcfa', '46'),
    ('cpm_max_fcfa', '85'),
    ('budget_jour_min_fcfa', '600'),
    ('kill_switch', 'false')
ON CONFLICT (cle) DO NOTHING;

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boosts')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boost_insights_jour')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boost_evenements')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boost_parametres') THEN
        RAISE NOTICE 'Migration 026 réussie : tables boosts, boost_insights_jour, boost_evenements, boost_parametres';
    ELSE
        RAISE EXCEPTION 'Migration 026 échouée : une ou plusieurs tables sont absentes';
    END IF;
END $$;
