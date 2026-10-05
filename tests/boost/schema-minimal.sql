-- Schéma minimal des tables marketplace utilisées par le boost, pour le test d'intégration
-- (src/services/boost.integration.test.ts). Reproduit les colonnes/enums lus par le code ;
-- les migrations 026/027 sont appliquées ensuite par le test. NE PAS exécuter sur Neon.

DO $$ BEGIN
  CREATE TYPE statut_paiement AS ENUM ('en_attente', 'partiellement_paye', 'paye', 'echec', 'rembourse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE methode_paiement AS ENUM ('mobile_money', 'airtel_money', 'moov_money', 'carte_bancaire', 'especes', 'virement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vendeurs (
  id SERIAL PRIMARY KEY,
  telephone TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT,
  statut TEXT NOT NULL DEFAULT 'actif',
  date_creation TIMESTAMPTZ DEFAULT NOW(),
  date_modification TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boutiques (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  vendeur_id INTEGER REFERENCES vendeurs(id),
  logo TEXT,
  banniere TEXT,
  telephone TEXT,
  statut TEXT DEFAULT 'actif',
  date_creation TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, nom TEXT);

CREATE TABLE IF NOT EXISTS produits (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  description_courte TEXT,
  prix INTEGER DEFAULT 0,
  boutique_id INTEGER REFERENCES boutiques(id),
  categorie_id INTEGER REFERENCES categories(id),
  images JSONB,
  image_principale TEXT,
  statut TEXT DEFAULT 'actif'
);

CREATE TABLE IF NOT EXISTS commandes (
  id SERIAL PRIMARY KEY,
  boutique_id INTEGER REFERENCES boutiques(id),
  numero_commande TEXT,
  statut TEXT DEFAULT 'en_attente',
  client_nom TEXT,
  client_telephone TEXT,
  client_adresse TEXT,
  client_ville TEXT,
  client_commune TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id),
  reference_transaction TEXT,
  montant INTEGER NOT NULL,
  methode_paiement methode_paiement,
  statut statut_paiement NOT NULL DEFAULT 'en_attente',
  type_paiement VARCHAR(50),
  numero_telephone TEXT,
  reference_operateur TEXT,
  date_creation TIMESTAMPTZ DEFAULT NOW(),
  date_confirmation TIMESTAMPTZ,
  date_modification TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  description TEXT
);
