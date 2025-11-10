-- Migration pour corriger la contrainte unique du panier
-- La contrainte sur session_id seul empêche d'avoir plusieurs produits dans un panier

-- Supprimer l'ancienne contrainte unique sur session_id
ALTER TABLE paniers DROP CONSTRAINT IF EXISTS paniers_session_id_key;

-- Ajouter un index pour améliorer les performances de recherche par session
CREATE INDEX IF NOT EXISTS idx_paniers_session_id ON paniers(session_id);

-- Optionnel : Ajouter une contrainte unique sur (session_id, produit_id, variants_selectionnes)
-- pour éviter les doublons exacts (même produit avec mêmes variants)
-- Note: Cette contrainte ne peut pas être ajoutée directement car variants_selectionnes est un JSONB
-- Il faudrait utiliser une contrainte d'exclusion ou gérer cela au niveau applicatif

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_paniers_produit_id ON paniers(produit_id);
CREATE INDEX IF NOT EXISTS idx_paniers_boutique_id ON paniers(boutique_id);

