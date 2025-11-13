-- Migration: Automatiser le changement de statut 'nouveau' des produits
-- Date: 2025-11-13
-- Description: Retire automatiquement le statut 'nouveau' des produits après 7 jours

-- ============================================
-- 1. Créer une fonction pour retirer le statut 'nouveau'
-- ============================================

CREATE OR REPLACE FUNCTION retirer_statut_nouveau_produits()
RETURNS INTEGER AS $$
DECLARE
  nb_produits_modifies INTEGER;
BEGIN
  -- Mettre à jour les produits qui ont le statut 'nouveau' depuis plus de 7 jours
  WITH produits_a_modifier AS (
    UPDATE produits
    SET 
      est_nouveau = false,
      date_modification = NOW()
    WHERE 
      est_nouveau = true
      AND date_creation <= NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO nb_produits_modifies FROM produits_a_modifier;
  
  -- Logger le résultat
  IF nb_produits_modifies > 0 THEN
    RAISE NOTICE 'Statut "nouveau" retiré pour % produit(s)', nb_produits_modifies;
  ELSE
    RAISE NOTICE 'Aucun produit à mettre à jour';
  END IF;
  
  RETURN nb_produits_modifies;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Activer l'extension pg_cron (si disponible)
-- ============================================

-- Note: pg_cron n'est pas disponible par défaut sur Supabase
-- Pour Supabase, vous devrez utiliser une Edge Function ou un service externe

-- Si vous utilisez votre propre PostgreSQL avec pg_cron :
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Planifier l'exécution quotidienne à 2h du matin
-- SELECT cron.schedule(
--   'retirer-statut-nouveau-produits',
--   '0 2 * * *',  -- Tous les jours à 2h du matin
--   $$SELECT retirer_statut_nouveau_produits();$$
-- );

-- ============================================
-- 3. Alternative pour Supabase : Utiliser une fonction RPC
-- ============================================

-- Pour Supabase, vous pouvez appeler cette fonction via RPC depuis votre code :
-- supabase.rpc('retirer_statut_nouveau_produits')

-- Ou créer une tâche planifiée dans votre application Node.js

-- ============================================
-- 4. Exécution manuelle initiale
-- ============================================

-- Exécuter une première fois pour nettoyer les produits existants
SELECT retirer_statut_nouveau_produits();

-- ============================================
-- 5. Vérification
-- ============================================

-- Compter les produits avec le statut 'nouveau' depuis plus de 7 jours
SELECT 
  COUNT(*) as nb_produits_nouveau_anciens,
  COUNT(*) FILTER (WHERE date_creation <= NOW() - INTERVAL '7 days') as nb_a_modifier
FROM produits
WHERE est_nouveau = true;

-- Voir les produits qui devraient être modifiés
SELECT 
  id,
  nom,
  est_nouveau,
  date_creation,
  EXTRACT(DAY FROM (NOW() - date_creation)) as jours_depuis_creation
FROM produits
WHERE 
  est_nouveau = true
  AND date_creation <= NOW() - INTERVAL '7 days'
ORDER BY date_creation DESC
LIMIT 10;

-- ============================================
-- 6. Fonction pour obtenir des statistiques
-- ============================================

CREATE OR REPLACE FUNCTION stats_produits_nouveau()
RETURNS TABLE(
  total_produits INTEGER,
  produits_nouveau INTEGER,
  produits_nouveau_recents INTEGER,
  produits_nouveau_anciens INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_produits,
    COUNT(*) FILTER (WHERE est_nouveau = true)::INTEGER as produits_nouveau,
    COUNT(*) FILTER (WHERE est_nouveau = true AND date_creation > NOW() - INTERVAL '7 days')::INTEGER as produits_nouveau_recents,
    COUNT(*) FILTER (WHERE est_nouveau = true AND date_creation <= NOW() - INTERVAL '7 days')::INTEGER as produits_nouveau_anciens
  FROM produits;
END;
$$ LANGUAGE plpgsql;

-- Tester la fonction de statistiques
SELECT * FROM stats_produits_nouveau();

