-- Modération des événements : un vendeur demande la publication (en_attente_validation),
-- seule l'équipe Marché 241 publie (actif) ou dépublie (inactif) via PATCH /produits/:id/publication.
-- `brouillon` est envoyé par le front pour les nouveaux événements : on s'assure qu'il existe aussi.
-- ADD VALUE ne peut pas être utilisé dans la même transaction que la nouvelle valeur : exécuter tel quel.

ALTER TYPE statut_produit ADD VALUE IF NOT EXISTS 'brouillon';
ALTER TYPE statut_produit ADD VALUE IF NOT EXISTS 'en_attente_validation';
