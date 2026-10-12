-- Marge plateforme personnalisée par vendeur (frais de service payés par l'acheteur).
--
-- vendeurs.taux_marge  : taux courant du vendeur, en % entier (10 par défaut, entre 10 et 50),
--                        modifiable uniquement depuis le back-office (marche241_admin).
-- commandes.taux_marge : taux figé à la création de la commande. Toute la vérification des
--                        paiements et le calcul des commissions / versements lisent ce taux,
--                        pour qu'un changement côté vendeur n'affecte ni les paiements en cours
--                        ni l'historique. Les commandes existantes prennent 10 (taux historique).
--
-- ⚠️ À appliquer d'abord sur une branche Neon, puis sur la base principale avec accord explicite.

ALTER TABLE vendeurs
  ADD COLUMN IF NOT EXISTS taux_marge SMALLINT NOT NULL DEFAULT 10;

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS taux_marge SMALLINT NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendeurs_taux_marge_bornes') THEN
    ALTER TABLE vendeurs
      ADD CONSTRAINT vendeurs_taux_marge_bornes CHECK (taux_marge BETWEEN 10 AND 50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commandes_taux_marge_bornes') THEN
    ALTER TABLE commandes
      ADD CONSTRAINT commandes_taux_marge_bornes CHECK (taux_marge BETWEEN 10 AND 50);
  END IF;
END $$;
