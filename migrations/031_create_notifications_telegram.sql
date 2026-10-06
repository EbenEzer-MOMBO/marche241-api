-- ============================================================================
-- Migration 031 : notifications Telegram de l'équipe Marché 241
-- ============================================================================
-- Le jeton du bot reste dans l'environnement de l'API (TELEGRAM_BOT_TOKEN).
-- Cette table (ligne unique id = 1) contient le canal, l'interrupteur général
-- et les événements à notifier, réglés depuis le back-office. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications_telegram (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  chat_id VARCHAR(64),
  canal_nom VARCHAR(255),
  actif BOOLEAN NOT NULL DEFAULT FALSE,
  evenements TEXT[] NOT NULL DEFAULT '{}',
  dernier_envoi_le TIMESTAMPTZ,
  derniere_erreur TEXT,
  modifie_par VARCHAR(255),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications_telegram IS 'Notifications Telegram de l''équipe (ligne unique, aucun secret : jeton du bot dans l''environnement de l''API)';
COMMENT ON COLUMN notifications_telegram.chat_id IS 'Canal Telegram : @nom_du_canal ou identifiant numérique (-100…)';

INSERT INTO notifications_telegram (id, evenements) VALUES (
  1,
  ARRAY['boost_a_valider', 'boost_erreur_meta', 'boost_rejete_meta', 'boost_a_rembourser',
        'commande_payee', 'paiement_echoue', 'versement_effectue', 'versement_echec',
        'vendeur_inscrit', 'boutique_creee', 'produit_a_valider']
) ON CONFLICT (id) DO NOTHING;
