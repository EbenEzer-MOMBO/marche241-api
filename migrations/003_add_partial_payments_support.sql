-- Migration: Support des paiements partiels
-- Date: 2025-11-09
-- Description: Ajoute le support pour les paiements partiels (acompte, frais de livraison, solde)

-- ============================================
-- 1. Modifier la table commandes
-- ============================================

-- Ajouter les colonnes pour suivre les montants payés
ALTER TABLE commandes 
  ADD COLUMN IF NOT EXISTS montant_paye INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_restant INTEGER DEFAULT 0;

-- Mettre à jour montant_restant pour les commandes existantes
UPDATE commandes 
SET montant_paye = 0,
    montant_restant = total
WHERE montant_paye IS NULL;

-- Créer une fonction pour mettre à jour automatiquement montant_restant
CREATE OR REPLACE FUNCTION update_montant_restant()
RETURNS TRIGGER AS $$
BEGIN
  NEW.montant_restant := NEW.total - NEW.montant_paye;
  
  -- Mettre à jour le statut de paiement automatiquement
  IF NEW.montant_paye = 0 THEN
    NEW.statut_paiement := 'en_attente';
  ELSIF NEW.montant_paye > 0 AND NEW.montant_paye < NEW.total THEN
    NEW.statut_paiement := 'partiellement_paye';
  ELSIF NEW.montant_paye >= NEW.total THEN
    NEW.statut_paiement := 'paye';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer un trigger pour mettre à jour montant_restant automatiquement
DROP TRIGGER IF EXISTS trigger_update_montant_restant ON commandes;
CREATE TRIGGER trigger_update_montant_restant
  BEFORE INSERT OR UPDATE OF total, montant_paye ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION update_montant_restant();

-- ============================================
-- 2. Modifier la table transactions
-- ============================================

-- Ajouter le type de paiement
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS type_paiement VARCHAR(50) DEFAULT 'paiement_complet';

-- Ajouter une description pour chaque transaction
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Ajouter un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_transactions_commande_type 
  ON transactions(commande_id, type_paiement);

-- ============================================
-- 3. Fonction pour calculer le montant payé d'une commande
-- ============================================

CREATE OR REPLACE FUNCTION recalculer_montant_paye_commande(p_commande_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_total_paye INTEGER;
BEGIN
  -- Calculer le total des transactions confirmées
  SELECT COALESCE(SUM(montant), 0)
  INTO v_total_paye
  FROM transactions
  WHERE commande_id = p_commande_id 
    AND statut = 'paye';
  
  -- Mettre à jour la commande
  UPDATE commandes
  SET montant_paye = v_total_paye
  WHERE id = p_commande_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. Trigger pour recalculer automatiquement le montant payé
-- ============================================

CREATE OR REPLACE FUNCTION trigger_recalculer_montant_paye()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculer pour l'ancienne commande si elle change
  IF TG_OP = 'UPDATE' AND OLD.commande_id IS DISTINCT FROM NEW.commande_id THEN
    PERFORM recalculer_montant_paye_commande(OLD.commande_id);
  END IF;
  
  -- Recalculer pour la nouvelle/actuelle commande
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculer_montant_paye_commande(OLD.commande_id);
  ELSE
    PERFORM recalculer_montant_paye_commande(NEW.commande_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger sur les transactions
DROP TRIGGER IF EXISTS trigger_transaction_update_montant_paye ON transactions;
CREATE TRIGGER trigger_transaction_update_montant_paye
  AFTER INSERT OR UPDATE OF statut, montant OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculer_montant_paye();

-- ============================================
-- 5. Mettre à jour les données existantes
-- ============================================

-- Recalculer le montant payé pour toutes les commandes existantes
DO $$
DECLARE
  v_commande RECORD;
BEGIN
  FOR v_commande IN SELECT DISTINCT commande_id FROM transactions
  LOOP
    PERFORM recalculer_montant_paye_commande(v_commande.commande_id);
  END LOOP;
END $$;

-- ============================================
-- 6. Commentaires pour documentation
-- ============================================

COMMENT ON COLUMN commandes.montant_paye IS 'Montant total déjà payé (en centimes)';
COMMENT ON COLUMN commandes.montant_restant IS 'Montant restant à payer (en centimes) - calculé automatiquement';
COMMENT ON COLUMN transactions.type_paiement IS 'Type de paiement: paiement_complet, acompte, frais_livraison, solde_apres_livraison, complement';
COMMENT ON COLUMN transactions.description IS 'Description du paiement pour clarification';

