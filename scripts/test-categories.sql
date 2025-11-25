-- Script de test pour vérifier les catégories populaires
-- À exécuter après la migration 006_insert_popular_categories.sql

-- 1. Compter les catégories globales
SELECT 
    'Catégories globales' as type,
    COUNT(*) as total
FROM categories 
WHERE boutique_id IS NULL;

-- 2. Lister quelques catégories globales
SELECT 
    id, 
    nom, 
    slug, 
    ordre_affichage,
    statut
FROM categories 
WHERE boutique_id IS NULL
ORDER BY ordre_affichage
LIMIT 10;

-- 3. Vérifier les slugs uniques
SELECT 
    slug, 
    COUNT(*) as occurrences
FROM categories
GROUP BY slug
HAVING COUNT(*) > 1;
-- Si aucun résultat, tous les slugs sont uniques ✓

-- 4. Statistiques par statut
SELECT 
    statut,
    boutique_id IS NULL as est_globale,
    COUNT(*) as total
FROM categories
GROUP BY statut, est_globale
ORDER BY est_globale DESC, statut;

-- 5. Tester la requête utilisée par l'API (simulation avec boutique_id = 1)
-- Cette requête simule ce que fait CategorieModel.getAllCategories(1)
SELECT 
    id,
    nom,
    slug,
    boutique_id,
    ordre_affichage,
    CASE 
        WHEN boutique_id IS NULL THEN 'Globale'
        ELSE 'Spécifique'
    END as type_categorie
FROM categories
WHERE boutique_id IS NULL OR boutique_id = 1
ORDER BY ordre_affichage;

-- 6. Trouver les catégories sans description
SELECT 
    id,
    nom,
    slug
FROM categories
WHERE description IS NULL OR description = ''
ORDER BY ordre_affichage;

