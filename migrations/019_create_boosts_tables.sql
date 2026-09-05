-- Migration: 019
-- Date: 2026-09-05
-- Description: Crée les tables du système de boost publicitaire Meta Ads (Phase 1 : boost de boutique uniquement,
-- forfaits fixes, ciblage géographique libre choisi par le vendeur, sans catalogue produit Meta)

-- ============================================
-- 1. Types énumérés
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_boost') THEN
        CREATE TYPE type_boost AS ENUM ('boutique', 'produit');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_boost') THEN
        CREATE TYPE statut_boost AS ENUM (
            'en_attente_paiement', -- créé, paiement pas encore confirmé
            'en_attente_revue',    -- payé, campagne soumise à Meta, en attente de la revue
            'actif',
            'rejete',
            'en_pause',
            'termine',
            'erreur'               -- échec technique (appel Meta en échec), à retraiter manuellement
        );
    END IF;
END $$;

-- ============================================
-- 2. Table boosts
-- ============================================

CREATE TABLE IF NOT EXISTS boosts (
    id SERIAL PRIMARY KEY,
    boutique_id INTEGER NOT NULL REFERENCES boutiques(id),
    vendeur_id INTEGER NOT NULL REFERENCES vendeurs(id),
    type_boost type_boost NOT NULL DEFAULT 'boutique',
    produit_id INTEGER NULL, -- réservé Phase 2 (boost produit), inutilisé en Phase 1
    forfait_code VARCHAR(50) NOT NULL,
    statut statut_boost NOT NULL DEFAULT 'en_attente_paiement',
    prix_vendeur_fcfa INTEGER NOT NULL,
    budget_meta_reel_fcfa INTEGER NOT NULL,
    duree_jours INTEGER NOT NULL,
    zones JSONB NOT NULL DEFAULT '[]'::jsonb, -- ciblage géographique libre choisi par le vendeur
    date_debut TIMESTAMPTZ NULL,
    date_fin TIMESTAMPTZ NULL,
    meta_campaign_id VARCHAR(100) NULL,
    meta_adset_id VARCHAR(100) NULL,
    meta_ad_id VARCHAR(100) NULL,
    meta_creative_id VARCHAR(100) NULL,
    meta_statut_revue VARCHAR(50) NULL,
    raison_rejet TEXT NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boosts_boutique_id ON boosts(boutique_id);
CREATE INDEX IF NOT EXISTS idx_boosts_vendeur_id ON boosts(vendeur_id);
CREATE INDEX IF NOT EXISTS idx_boosts_statut ON boosts(statut);

COMMENT ON TABLE boosts IS 'Boosts publicitaires Meta Ads — Phase 1 : boutique uniquement, forfaits fixes, paiement à l''acte';
COMMENT ON COLUMN boosts.produit_id IS 'Réservé Phase 2 (boost produit) — toujours NULL en Phase 1';
COMMENT ON COLUMN boosts.forfait_code IS 'Code du forfait choisi (voir src/config/forfaits-boost.config.ts) : decouverte, standard, pro, max';
COMMENT ON COLUMN boosts.zones IS 'Ciblage géographique libre choisi par le vendeur (liste de pays/villes ou ["monde_entier"]) — sans impact sur le prix du forfait';

-- ============================================
-- 3. Table boost_evenements (journal d'audit)
-- ============================================

CREATE TABLE IF NOT EXISTS boost_evenements (
    id SERIAL PRIMARY KEY,
    boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
    type_evenement VARCHAR(50) NOT NULL, -- creation, paiement_confirme, publie, revue_maj, stats_maj, pause, reprise, termine, erreur
    donnees JSONB NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boost_evenements_boost_id ON boost_evenements(boost_id);

COMMENT ON TABLE boost_evenements IS 'Historique des événements/transitions de statut d''un boost, pour audit et debug';

-- ============================================
-- 4. Table boost_stats (snapshots périodiques)
-- ============================================

CREATE TABLE IF NOT EXISTS boost_stats (
    id SERIAL PRIMARY KEY,
    boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
    impressions INTEGER NOT NULL DEFAULT 0,
    clics INTEGER NOT NULL DEFAULT 0,
    depense_fcfa INTEGER NOT NULL DEFAULT 0,
    date_snapshot TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boost_stats_boost_id ON boost_stats(boost_id);

COMMENT ON TABLE boost_stats IS 'Snapshots périodiques des statistiques Meta (impressions/clics/dépense) par boost';

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boosts')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boost_evenements')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'boost_stats') THEN
        RAISE NOTICE 'Migration 019 réussie : tables boosts, boost_evenements, boost_stats créées';
    ELSE
        RAISE EXCEPTION 'Migration 019 échouée : une ou plusieurs tables sont absentes';
    END IF;
END $$;
