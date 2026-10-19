-- Galerie de fichiers de marque et emplacements fixes (logos, hero, illustrations).

CREATE TABLE IF NOT EXISTS medias (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(150) NOT NULL,
  url           TEXT NOT NULL,
  storage_path  TEXT NOT NULL UNIQUE,
  mime_type     VARCHAR(50) NOT NULL,
  taille_octets INTEGER NOT NULL,
  largeur       INTEGER,
  hauteur       INTEGER,
  cree_par      VARCHAR(150),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets_marque (
  cle         VARCHAR(50) PRIMARY KEY,
  media_id    INTEGER REFERENCES medias(id) ON DELETE RESTRICT,
  libelle     VARCHAR(100) NOT NULL,
  description TEXT,
  formats     VARCHAR(100) NOT NULL,
  dimensions_conseillees VARCHAR(50),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO assets_marque (cle, libelle, description, formats, dimensions_conseillees)
VALUES
  ('logo_icone', 'Symbole', 'Landing, affiches, JSON-LD, manifests', 'image/svg+xml,image/png', NULL),
  ('logo_texte', 'Texte seul', 'Logo textuel et billets PDF', 'image/svg+xml,image/png', NULL),
  ('logo_complet', 'Logo complet', 'Connexion vendeur et back-office', 'image/svg+xml,image/png', NULL),
  ('logo_email', 'Logo email', 'En-tête des emails (PNG, les clients mail ignorent le SVG)', 'image/png,image/jpeg', NULL),
  ('favicon', 'Favicon', 'Onglet du navigateur', 'image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml', '32x32'),
  ('icone_app', 'Icône application', 'PWA et apple-touch, PNG carré', 'image/png', '512x512'),
  ('image_partage', 'Image de partage', 'Open Graph et Twitter de la page d''accueil', 'image/png,image/jpeg,image/webp', '1200x630'),
  ('hero_home', 'Hero accueil', 'Bannière principale de la landing', 'image/jpeg,image/png,image/webp', NULL),
  ('illustration_1', 'Illustration 1', 'Captures et affiches', 'image/png,image/jpeg,image/webp', NULL),
  ('illustration_2', 'Illustration 2', 'Section à propos et captures', 'image/png,image/jpeg,image/webp', NULL),
  ('illustration_3', 'Illustration 3', 'Section à propos et captures', 'image/jpeg,image/png,image/webp', NULL),
  ('fond_billetterie', 'Fond billetterie', 'Section billetterie de la landing', 'image/jpeg,image/png,image/webp', NULL),
  ('image_boutique_defaut', 'Boutique par défaut', 'Vignette si la boutique n''a pas de logo', 'image/png,image/jpeg,image/webp', NULL),
  ('image_produit_defaut', 'Produit par défaut', 'Vignette si le produit n''a pas d''image', 'image/png,image/jpeg,image/webp', NULL)
ON CONFLICT (cle) DO NOTHING;
