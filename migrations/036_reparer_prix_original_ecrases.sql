-- Réparation : prix_original écrasé par le prix promo lors de la modification d'un produit.
--
-- Bug corrigé dans le code (fix/prix-promo-edition) : le front envoyait le prix PROMO dans `prix`
-- et dans `prix_promo`, donc updateProduit() stockait prix = prix_original = promo.
-- Résultat visible : « 15 000 XAF » avec « 15 000 XAF » barré, et promotion perdue.
--
-- Convention de stockage : produits.prix = prix actif (promo si promo), produits.prix_original = prix normal.
--
-- ⚠️ À TESTER D'ABORD SUR UNE BRANCHE NEON, puis sur la base principale avec accord explicite.
--    1) Lancer la section « APERÇU » seule et vérifier les lignes.
--    2) Lancer la section « RÉPARATION » (transaction, sauvegarde incluse).
--    Cas hors périmètre (à traiter à la main) : produit 172 (prix_original < prix), produits sans trace de prix normal.

-- ============================================
-- APERÇU (lecture seule)
-- ============================================
-- Prix normal retrouvé dans les variants : variant dont prix_promo = prix actuel et prix > prix_promo.
/*
SELECT p.id, p.nom, p.prix AS prix_actuel, p.prix_original AS original_actuel,
       r.prix_normal AS original_repare
FROM produits p
CROSS JOIN LATERAL (
  SELECT min((v->>'prix')::int) AS prix_normal
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p.variants::jsonb->'variants') = 'array'
              THEN p.variants::jsonb->'variants' ELSE '[]'::jsonb END) v
  WHERE (v->>'prix_promo')::int = p.prix
    AND (v->>'prix_promo')::int > 0
    AND (v->>'prix')::int > p.prix
) r
WHERE p.prix_original = p.prix
  AND r.prix_normal IS NOT NULL
ORDER BY p.id;
*/

-- ============================================
-- RÉPARATION
-- ============================================
BEGIN;

-- Sauvegarde des lignes touchées (supprimer la table une fois la réparation validée)
CREATE TABLE IF NOT EXISTS produits_backup_prix_036 AS
SELECT id, prix, prix_original, est_en_promotion, date_modification
FROM produits
WHERE prix_original IS NOT NULL AND prix_original <= prix;

-- 1) Restaurer le prix normal depuis les variants quand la promo y est encore tracée
UPDATE produits p
SET prix_original = r.prix_normal
FROM (
  SELECT p2.id,
         (SELECT min((v->>'prix')::int)
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(p2.variants::jsonb->'variants') = 'array'
                        THEN p2.variants::jsonb->'variants' ELSE '[]'::jsonb END) v
           WHERE (v->>'prix_promo')::int = p2.prix
             AND (v->>'prix_promo')::int > 0
             AND (v->>'prix')::int > p2.prix) AS prix_normal
  FROM produits p2
  WHERE p2.prix_original = p2.prix
) r
WHERE p.id = r.id
  AND r.prix_normal IS NOT NULL;

-- 2) Les produits restants avec prix_original = prix n'ont aucune promo traçable :
--    on retire le faux « prix barré ».
UPDATE produits
SET prix_original = NULL
WHERE prix_original = prix;

-- Contrôle : ne doit plus rester de prix_original <= prix, hormis le produit 172 (à corriger à la main)
SELECT id, nom, prix, prix_original
FROM produits
WHERE prix_original IS NOT NULL AND prix_original <= prix;

COMMIT;
