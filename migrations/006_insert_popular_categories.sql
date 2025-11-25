-- Migration: Insertion des catégories populaires globales
-- Description: Ajoute les catégories les plus courantes sans boutique_id spécifique
-- Date: 2025-11-25

-- Insertion des catégories populaires
INSERT INTO categories (nom, slug, description, ordre_affichage, statut, date_creation, date_modification) 
VALUES 
  -- Alimentation
  ('Alimentation', 'alimentation', 'Produits alimentaires et boissons', 1, 'active', NOW(), NOW()),
  ('Fruits et Légumes', 'fruits-et-legumes', 'Fruits et légumes frais', 2, 'active', NOW(), NOW()),
  ('Viandes et Poissons', 'viandes-et-poissons', 'Viandes, volailles et poissons', 3, 'active', NOW(), NOW()),
  ('Produits Laitiers', 'produits-laitiers', 'Lait, fromage, yaourts', 4, 'active', NOW(), NOW()),
  ('Épicerie', 'epicerie', 'Produits d\'épicerie générale', 5, 'active', NOW(), NOW()),
  ('Boissons', 'boissons', 'Boissons alcoolisées et non alcoolisées', 6, 'active', NOW(), NOW()),
  
  -- Mode et Accessoires
  ('Mode', 'mode', 'Vêtements et accessoires', 7, 'active', NOW(), NOW()),
  ('Vêtements Homme', 'vetements-homme', 'Mode masculine', 8, 'active', NOW(), NOW()),
  ('Vêtements Femme', 'vetements-femme', 'Mode féminine', 9, 'active', NOW(), NOW()),
  ('Vêtements Enfant', 'vetements-enfant', 'Mode pour enfants', 10, 'active', NOW(), NOW()),
  ('Chaussures', 'chaussures', 'Chaussures pour tous', 11, 'active', NOW(), NOW()),
  ('Accessoires', 'accessoires', 'Sacs, bijoux et accessoires', 12, 'active', NOW(), NOW()),
  
  -- Électronique
  ('Électronique', 'electronique', 'Appareils et gadgets électroniques', 13, 'active', NOW(), NOW()),
  ('Téléphones et Tablettes', 'telephones-et-tablettes', 'Smartphones et tablettes', 14, 'active', NOW(), NOW()),
  ('Ordinateurs', 'ordinateurs', 'Ordinateurs et accessoires', 15, 'active', NOW(), NOW()),
  ('Électroménager', 'electromenager', 'Appareils électroménagers', 16, 'active', NOW(), NOW()),
  
  -- Maison et Décoration
  ('Maison et Décoration', 'maison-et-decoration', 'Articles pour la maison', 17, 'active', NOW(), NOW()),
  ('Meubles', 'meubles', 'Mobilier pour la maison', 18, 'active', NOW(), NOW()),
  ('Décoration', 'decoration', 'Objets décoratifs', 19, 'active', NOW(), NOW()),
  ('Cuisine', 'cuisine', 'Ustensiles et équipements de cuisine', 20, 'active', NOW(), NOW()),
  
  -- Beauté et Santé
  ('Beauté et Santé', 'beaute-et-sante', 'Produits de beauté et santé', 21, 'active', NOW(), NOW()),
  ('Cosmétiques', 'cosmetiques', 'Maquillage et soins', 22, 'active', NOW(), NOW()),
  ('Parfums', 'parfums', 'Parfums et eaux de toilette', 23, 'active', NOW(), NOW()),
  ('Soins du Corps', 'soins-du-corps', 'Produits de soin corporel', 24, 'active', NOW(), NOW()),
  
  -- Sports et Loisirs
  ('Sports et Loisirs', 'sports-et-loisirs', 'Articles de sport et loisirs', 25, 'active', NOW(), NOW()),
  ('Sport', 'sport', 'Équipements sportifs', 26, 'active', NOW(), NOW()),
  ('Jeux et Jouets', 'jeux-et-jouets', 'Jeux et jouets pour enfants', 27, 'active', NOW(), NOW()),
  
  -- Automobile
  ('Automobile', 'automobile', 'Pièces et accessoires auto', 28, 'active', NOW(), NOW()),
  ('Pièces Auto', 'pieces-auto', 'Pièces détachées automobiles', 29, 'active', NOW(), NOW()),
  ('Accessoires Auto', 'accessoires-auto', 'Accessoires pour véhicules', 30, 'active', NOW(), NOW()),
  
  -- Livres et Papeterie
  ('Livres et Papeterie', 'livres-et-papeterie', 'Livres et fournitures de bureau', 31, 'active', NOW(), NOW()),
  ('Livres', 'livres', 'Livres et publications', 32, 'active', NOW(), NOW()),
  ('Papeterie', 'papeterie', 'Fournitures de bureau', 33, 'active', NOW(), NOW()),
  
  -- Services
  ('Services', 'services', 'Services divers', 34, 'active', NOW(), NOW()),
  
  -- Autres
  ('Autres', 'autres', 'Autres catégories', 35, 'active', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Note: L'option ON CONFLICT (slug) DO NOTHING permet d'éviter les erreurs
-- si certaines catégories existent déjà avec le même slug

