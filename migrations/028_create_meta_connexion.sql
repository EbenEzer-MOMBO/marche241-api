-- ============================================================================
-- Migration 028 : connexion Meta Ads centralisée (boost publicitaire)
-- ============================================================================
-- Les secrets (META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN) restent dans
-- l'environnement de l'API. Cette table ne contient que ce qui est découvert
-- auprès de Meta et choisi dans le back-office : compte publicitaire, Page,
-- compte Instagram, plus le résultat de la dernière vérification.
-- Une seule ligne (id = 1). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta_connexion (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ad_account_id VARCHAR(64),
  ad_account_nom VARCHAR(255),
  devise VARCHAR(8),
  fuseau VARCHAR(64),
  statut_compte INTEGER,
  page_id VARCHAR(64),
  page_nom VARCHAR(255),
  instagram_id VARCHAR(64),
  instagram_nom VARCHAR(255),
  jeton_valide BOOLEAN,
  jeton_permissions TEXT[] NOT NULL DEFAULT '{}',
  jeton_expire_le TIMESTAMPTZ,
  verifie_le TIMESTAMPTZ,
  message_erreur TEXT,
  modifie_par VARCHAR(255),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meta_connexion IS 'Connexion Meta Ads du boost (ligne unique, aucun secret : jeton et secret d''app dans l''environnement de l''API)';
COMMENT ON COLUMN meta_connexion.ad_account_id IS 'Identifiant du compte publicitaire sans le préfixe act_';
COMMENT ON COLUMN meta_connexion.statut_compte IS 'account_status Meta (1 = actif, 2 = désactivé, 3 = impayé…)';

INSERT INTO meta_connexion (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
