-- Migration: Création de la table commissions_affiliees et des triggers de commission
-- Date: 2026-09-05
-- Description: Cœur du système d'affiliation. Une commande peut passer au statut
-- 'livree' par deux chemins indépendants (API Node ou Admin Laravel), tous deux en
-- UPDATE SQL direct sur la table commandes. Seul un trigger PostgreSQL voit les deux
-- chemins de façon fiable : à la livraison confirmée d'une commande rattachée à un
-- affilié, une ligne commissions_affiliees est créée automatiquement, avec le taux
-- de commission propre à cet affilié capturé au moment de la création (les
-- changements de taux ultérieurs ne sont jamais rétroactifs).

-- ============================================
-- 1. TABLE COMMISSIONS_AFFILIEES
-- ============================================

CREATE TABLE IF NOT EXISTS commissions_affiliees (
  id SERIAL PRIMARY KEY,
  affilie_id INTEGER NOT NULL REFERENCES affilies(id),
  commande_id INTEGER NOT NULL UNIQUE REFERENCES commandes(id),
  boutique_id INTEGER NOT NULL REFERENCES boutiques(id),
  montant_base NUMERIC(12,2) NOT NULL,
  taux NUMERIC(5,4) NOT NULL,
  montant_commission NUMERIC(12,2) NOT NULL,
  statut VARCHAR(20) NOT NULL DEFAULT 'due',
  reference_versement VARCHAR(255),
  notifie_le TIMESTAMP,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_versement TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commissions_affilie_id ON commissions_affiliees(affilie_id);
CREATE INDEX IF NOT EXISTS idx_commissions_statut ON commissions_affiliees(statut);
CREATE INDEX IF NOT EXISTS idx_commissions_notifie_le ON commissions_affiliees(notifie_le);

COMMENT ON COLUMN commissions_affiliees.commande_id IS 'UNIQUE : empêche toute commission en double pour une même commande';
COMMENT ON COLUMN commissions_affiliees.taux IS 'Taux figé au moment de la création, copié depuis affilies.taux_commission';
COMMENT ON COLUMN commissions_affiliees.statut IS 'due | payee | annulee';

-- ============================================
-- 2. TRIGGER : CRÉATION DE LA COMMISSION À LA LIVRAISON
-- ============================================

CREATE OR REPLACE FUNCTION fn_creer_commission_affilie() RETURNS TRIGGER AS $$
DECLARE
  v_taux NUMERIC(5,4);
  v_montant_base NUMERIC(12,2);
BEGIN
  v_montant_base := COALESCE(NEW.montant_paye, 0);
  IF v_montant_base <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT taux_commission INTO v_taux FROM affilies WHERE id = NEW.affilie_id;
  IF v_taux IS NULL THEN
    v_taux := 0.0250;
  END IF;

  INSERT INTO commissions_affiliees (affilie_id, commande_id, boutique_id, montant_base, taux, montant_commission, statut)
  VALUES (NEW.affilie_id, NEW.id, NEW.boutique_id, v_montant_base, v_taux, ROUND(v_montant_base * v_taux, 2), 'due')
  ON CONFLICT (commande_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commandes_creer_commission_affilie ON commandes;
CREATE TRIGGER trg_commandes_creer_commission_affilie
  AFTER UPDATE OF statut ON commandes
  FOR EACH ROW
  WHEN (NEW.statut = 'livree' AND OLD.statut IS DISTINCT FROM 'livree' AND NEW.affilie_id IS NOT NULL)
  EXECUTE FUNCTION fn_creer_commission_affilie();

-- ============================================
-- 3. TRIGGER : ANNULATION SI RETOUR/REMBOURSEMENT APRÈS LIVRAISON
-- ============================================

CREATE OR REPLACE FUNCTION fn_annuler_commission_affilie() RETURNS TRIGGER AS $$
BEGIN
  UPDATE commissions_affiliees
  SET statut = 'annulee'
  WHERE commande_id = NEW.id AND statut = 'due';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commandes_annuler_commission_affilie ON commandes;
CREATE TRIGGER trg_commandes_annuler_commission_affilie
  AFTER UPDATE OF statut ON commandes
  FOR EACH ROW
  WHEN (NEW.statut IN ('annulee', 'remboursee') AND OLD.statut = 'livree')
  EXECUTE FUNCTION fn_annuler_commission_affilie();

-- ============================================
-- VÉRIFICATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'commissions_affiliees'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_commandes_creer_commission_affilie'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_commandes_annuler_commission_affilie'
    ) THEN
        RAISE NOTICE 'Migration réussie: table commissions_affiliees et triggers créés';
    ELSE
        RAISE EXCEPTION 'Migration échouée: table ou triggers manquants';
    END IF;
END $$;
