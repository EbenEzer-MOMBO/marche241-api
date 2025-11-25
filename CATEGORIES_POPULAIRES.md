# Catégories Populaires

## 📋 Description

Ce système permet d'avoir des catégories globales (partagées par toutes les boutiques) et des catégories spécifiques à chaque boutique.

## 🎯 Fonctionnement

### Catégories Globales
- **Définition** : Catégories sans `boutique_id` (NULL)
- **Visibilité** : Disponibles pour toutes les boutiques
- **Utilité** : Catégories communes et populaires (Alimentation, Mode, Électronique, etc.)

### Catégories Spécifiques
- **Définition** : Catégories avec un `boutique_id` spécifique
- **Visibilité** : Uniquement pour la boutique propriétaire
- **Utilité** : Catégories personnalisées créées par chaque boutique

## 🚀 Installation

### 1. Exécuter la migration SQL

```bash
psql -h votre-host -U votre-user -d votre-database -f migrations/006_insert_popular_categories.sql
```

Ou via Supabase Dashboard :
1. Aller dans SQL Editor
2. Copier le contenu de `migrations/006_insert_popular_categories.sql`
3. Exécuter la requête

### 2. Vérification

```sql
-- Vérifier les catégories globales
SELECT id, nom, slug, boutique_id 
FROM categories 
WHERE boutique_id IS NULL
ORDER BY ordre_affichage;
```

## 📊 Catégories Insérées

La migration insère 35 catégories populaires :

### Alimentation (6 catégories)
- Alimentation
- Fruits et Légumes
- Viandes et Poissons
- Produits Laitiers
- Épicerie
- Boissons

### Mode et Accessoires (6 catégories)
- Mode
- Vêtements Homme
- Vêtements Femme
- Vêtements Enfant
- Chaussures
- Accessoires

### Électronique (4 catégories)
- Électronique
- Téléphones et Tablettes
- Ordinateurs
- Électroménager

### Maison et Décoration (4 catégories)
- Maison et Décoration
- Meubles
- Décoration
- Cuisine

### Beauté et Santé (4 catégories)
- Beauté et Santé
- Cosmétiques
- Parfums
- Soins du Corps

### Sports et Loisirs (3 catégories)
- Sports et Loisirs
- Sport
- Jeux et Jouets

### Automobile (3 catégories)
- Automobile
- Pièces Auto
- Accessoires Auto

### Livres et Papeterie (3 catégories)
- Livres et Papeterie
- Livres
- Papeterie

### Autres (2 catégories)
- Services
- Autres

## 🔧 API

### Récupérer toutes les catégories (sans filtre)

```http
GET /api/v1/categories
```

**Réponse** : Toutes les catégories (globales + spécifiques)

### Récupérer les catégories pour une boutique

```http
GET /api/v1/categories?boutique_id=1
```

**Réponse** : Catégories globales + catégories spécifiques à la boutique 1

**Exemple de réponse** :

```json
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "nom": "Alimentation",
      "slug": "alimentation",
      "boutique_id": null,
      "nombre_produits": 150
    },
    {
      "id": 50,
      "nom": "Ma Catégorie Perso",
      "slug": "ma-categorie-perso",
      "boutique_id": 1,
      "nombre_produits": 5
    }
  ]
}
```

## 💡 Cas d'Usage

### Exemple 1 : Nouvelle Boutique
Une nouvelle boutique peut immédiatement utiliser les 35 catégories populaires sans avoir à les créer.

```javascript
// GET /api/v1/categories?boutique_id=123
// Retourne les 35 catégories globales même si la boutique vient d'être créée
```

### Exemple 2 : Boutique avec Catégories Personnalisées
Une boutique peut créer ses propres catégories en plus des globales.

```javascript
// POST /api/v1/categories
{
  "nom": "Produits Locaux",
  "slug": "produits-locaux",
  "boutique_id": 123
}

// GET /api/v1/categories?boutique_id=123
// Retourne : 35 catégories globales + 1 catégorie personnalisée = 36 catégories
```

### Exemple 3 : Comptage des Produits
Chaque catégorie inclut le nombre de produits associés.

```json
{
  "id": 1,
  "nom": "Alimentation",
  "nombre_produits": 150  // 150 produits dans cette catégorie
}
```

## 🔍 Logs de Débogage

Le système inclut des logs détaillés :

```
[CategorieController] ===== GET ALL CATEGORIES =====
[CategorieController] Query params: { boutique_id: '1' }
[CategorieController] Boutique ID parsé: 1
[CategorieModel] ===== GET ALL CATEGORIES =====
[CategorieModel] Boutique ID: 1
[CategorieModel] Filtrage: catégories globales + boutique 1
[CategorieModel] Nombre de catégories récupérées: 40
[CategorieController] Nombre de catégories retournées: 40
[CategorieController] Catégories globales: 35
[CategorieController] Catégories spécifiques: 5
```

## ⚠️ Notes Importantes

1. **Slug Unique** : La migration utilise `ON CONFLICT (slug) DO NOTHING` pour éviter les doublons
2. **Ordre d'Affichage** : Les catégories sont triées par `ordre_affichage`
3. **Statut** : Toutes les catégories sont créées avec le statut `active`
4. **Suppression** : Les catégories globales ne devraient pas être supprimées

## 🛠️ Maintenance

### Ajouter une nouvelle catégorie globale

```sql
INSERT INTO categories (nom, slug, description, ordre_affichage, statut, date_creation, date_modification)
VALUES ('Nouvelle Catégorie', 'nouvelle-categorie', 'Description', 36, 'active', NOW(), NOW());
```

### Désactiver une catégorie globale

```sql
UPDATE categories 
SET statut = 'inactive', date_modification = NOW()
WHERE slug = 'categorie-a-desactiver' AND boutique_id IS NULL;
```

## 📝 TODO

- [ ] Ajouter la possibilité pour une boutique de "masquer" certaines catégories globales
- [ ] Ajouter des icônes pour chaque catégorie
- [ ] Permettre la traduction des catégories globales
- [ ] Ajouter des méta-données (couleur, image de bannière, etc.)

