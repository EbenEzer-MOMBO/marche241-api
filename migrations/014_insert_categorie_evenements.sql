-- Migration: Catégorie globale Événements (NeonDB)
-- Description: Ajoute la catégorie catalogue pour les formats événement
-- Date: 2026-08-21

INSERT INTO categories (nom, slug, description, ordre_affichage, statut, date_creation, date_modification)
VALUES
  ('Événements', 'evenements', 'Concerts, ateliers, billetterie et événements', 36, 'active', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
