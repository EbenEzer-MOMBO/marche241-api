# Correction - Champs Produit Manquants ou Non Préservés

## Problème Identifié

### Contexte
Lors de la création d'un produit, certains champs envoyés par le frontend **disparaissaient** pendant la validation, notamment :
- `prix_promo` (prix promotionnel)
- `en_stock` (stock disponible) 
- `image_principale` (image principale du produit)
- `variants` (variantes du produit)

### Exemple du Problème

**Body reçu du frontend :**
```json
{
  "nom": "csdcs",
  "slug": "csdcs",
  "description": "sdcsdc",
  "prix": 500,
  "en_stock": 2,              // ✅ Envoyé
  "boutique_id": 1,
  "categorie_id": 39,
  "images": [...],
  "image_principale": "...",  // ✅ Envoyé
  "variants": {...},          // ✅ Envoyé
  "statut": "actif"
  // ❌ prix_promo non envoyé car pas de promotion
}
```

**Données après validation (AVANT correction) :**
```json
{
  "nom": "csdcs",
  "slug": "csdcs",
  "description": "sdcsdc",
  "prix": 500,
  "stock": 0,                 // ❌ en_stock perdu, valeur par défaut utilisée
  "boutique_id": 1,
  "categorie_id": 39,
  "images": [...],
  "statut": "actif"
  // ❌ image_principale perdu
  // ❌ variants perdu
  // ❌ prix_promo absent (normal car non envoyé)
}
```

## Causes Identifiées

### 1. Champs Optionnels Non Préservés par Joi

**Problème :** Les champs optionnels sans `.optional()` explicite ne sont pas inclus dans le résultat validé quand ils sont absents du body.

**Exemple :**
```typescript
// ❌ AVANT
prix_promo: Joi.number().min(0).allow(null)
// Le champ disparaît s'il n'est pas envoyé

// ✅ APRÈS
prix_promo: Joi.number().min(0).optional().allow(null)
// Le champ est préservé s'il est envoyé, sinon undefined
```

### 2. Champs Manquants du Schéma de Validation

**Problème :** Les champs `image_principale`, `variants`, et `en_stock` n'étaient pas définis dans le schéma, donc supprimés par `stripUnknown: true`.

**Solution :** Ajout de ces champs au schéma avec `.optional()`.

### 3. Incompatibilité de Noms de Champs

**Problème :** Le frontend envoie `en_stock` mais la base de données attend `quantite_stock`.

**Solution :** Normalisation dans le middleware de validation.

## Solutions Appliquées

### 1. Mise à Jour des Schémas de Validation

**Fichier modifié :** `src/routes/produit.routes.ts`

#### Pour `createProduitSchema` :
```typescript
const createProduitSchema = Joi.object({
  // ... autres champs ...
  
  prix_promo: Joi.number().min(0).optional().allow(null).messages({
    'number.min': 'Le prix promotionnel doit être positif'
  }),
  
  stock: Joi.number().integer().min(0).default(0).messages({
    'number.min': 'Le stock doit être positif'
  }),
  
  en_stock: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Le stock doit être positif'
  }),
  
  image_principale: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'image principale doit être une URL valide'
  }),
  
  variants: Joi.object().optional().allow(null).messages({
    'object.base': 'Les variants doivent être un objet'
  }),
  
  // ... autres champs ...
});
```

**Changements :**
- ✅ Ajout de `.optional()` à `prix_promo` pour le préserver quand envoyé
- ✅ Ajout de `en_stock` comme champ optionnel alternatif à `stock`
- ✅ Ajout de `image_principale` comme champ optionnel
- ✅ Ajout de `variants` comme champ optionnel
- ✅ Ajout de `.optional()` à `categorie_id` et `images` pour cohérence

### 2. Normalisation des Noms de Champs

**Fichier modifié :** `src/middlewares/validation.middleware.ts`

```typescript
// Normaliser les noms de champs (en_stock → quantite_stock pour compatibilité)
if (value.en_stock !== undefined && value.stock === 0) {
  value.quantite_stock = value.en_stock;
  delete value.en_stock;
  console.log('[ValidationMiddleware] Normalisation: en_stock → quantite_stock:', value.quantite_stock);
} else if (value.stock !== undefined) {
  value.quantite_stock = value.stock;
  delete value.stock;
  console.log('[ValidationMiddleware] Normalisation: stock → quantite_stock:', value.quantite_stock);
}
```

**Logique :**
1. Si `en_stock` est envoyé et que `stock` a la valeur par défaut (0), utiliser `en_stock`
2. Sinon, si `stock` est envoyé, l'utiliser
3. Renommer le champ en `quantite_stock` (nom attendu par la base de données)
4. Supprimer les champs originaux pour éviter la confusion

### 3. Application aux Deux Schémas

Les mêmes corrections ont été appliquées à :
- ✅ `createProduitSchema` (création de produit)
- ✅ `updateProduitSchema` (mise à jour de produit)

## Résultats Attendus

### Après la Correction

**Body reçu du frontend :**
```json
{
  "nom": "Produit Test",
  "slug": "produit-test",
  "prix": 10000,
  "prix_promo": 8500,         // Promotion active
  "en_stock": 50,
  "image_principale": "https://example.com/image.jpg",
  "variants": {
    "variants": [
      {"nom": "Couleur", "options": ["Rouge", "Bleu"]}
    ]
  },
  "boutique_id": 1,
  "categorie_id": 5
}
```

**Données après validation (APRÈS correction) :**
```json
{
  "nom": "Produit Test",
  "slug": "produit-test",
  "prix": 10000,
  "prix_promo": 8500,         // ✅ Préservé
  "quantite_stock": 50,       // ✅ Normalisé depuis en_stock
  "image_principale": "https://example.com/image.jpg",  // ✅ Préservé
  "variants": {               // ✅ Préservé
    "variants": [
      {"nom": "Couleur", "options": ["Rouge", "Bleu"]}
    ]
  },
  "boutique_id": 1,
  "categorie_id": 5,
  "statut": "actif"           // ✅ Valeur par défaut
}
```

### Cas Particuliers

#### Cas 1 : Produit Sans Promotion
```json
// Body envoyé (sans prix_promo)
{
  "nom": "Produit",
  "prix": 5000,
  "en_stock": 10
}

// Après validation
{
  "nom": "Produit",
  "prix": 5000,
  "quantite_stock": 10,
  "statut": "actif"
  // prix_promo est undefined (non présent) ✅
}
```

#### Cas 2 : Produit Sans Variantes
```json
// Body envoyé (avec variants vide)
{
  "nom": "Produit Simple",
  "prix": 3000,
  "variants": {
    "variants": [],
    "options": []
  }
}

// Après validation
{
  "nom": "Produit Simple",
  "prix": 3000,
  "variants": {               // ✅ Préservé même si vide
    "variants": [],
    "options": []
  },
  "quantite_stock": 0,        // Valeur par défaut
  "statut": "actif"
}
```

## Impact

### Avant la Correction
- ❌ Perte de données importantes (`prix_promo`, `variants`, `image_principale`)
- ❌ Stock incorrect (toujours 0 au lieu de la valeur envoyée)
- ❌ Impossibilité de créer des produits avec promotions
- ❌ Impossibilité de créer des produits avec variantes

### Après la Correction
- ✅ Toutes les données sont préservées
- ✅ Stock correctement enregistré
- ✅ Promotions fonctionnelles
- ✅ Variantes correctement gérées
- ✅ Compatibilité frontend/backend assurée

## Vérification

Pour vérifier que la correction fonctionne :

1. **Test avec promotion :**
   ```bash
   POST /api/v1/produits
   {
     "nom": "Test",
     "prix": 1000,
     "prix_promo": 800,
     "en_stock": 5,
     "boutique_id": 1
   }
   ```
   ➡️ Vérifier que `prix_promo` est enregistré

2. **Test avec variantes :**
   ```bash
   POST /api/v1/produits
   {
     "nom": "Test Variant",
     "prix": 2000,
     "variants": {"variants": [{"nom": "Taille", "options": ["S", "M"]}]},
     "boutique_id": 1
   }
   ```
   ➡️ Vérifier que `variants` est enregistré

3. **Test avec image principale :**
   ```bash
   POST /api/v1/produits
   {
     "nom": "Test Image",
     "prix": 1500,
     "image_principale": "https://example.com/img.jpg",
     "boutique_id": 1
   }
   ```
   ➡️ Vérifier que `image_principale` est enregistré

## Notes Techniques

### Différence entre `.allow(null)` et `.optional()`

```typescript
// .allow(null) : Accepte null comme valeur valide, mais supprime le champ s'il est absent
prix_promo: Joi.number().allow(null)

// .optional() : Marque le champ comme optionnel ET le préserve dans le résultat
prix_promo: Joi.number().optional().allow(null)
```

### stripUnknown: true

Le middleware utilise `stripUnknown: true` pour supprimer les champs non définis dans le schéma. C'est une bonne pratique de sécurité, mais nécessite que **tous les champs attendus soient définis dans le schéma**.

## Date de Correction

**Date :** 25 novembre 2025  
**Version :** 1.0.1  
**Fichiers modifiés :**
- `src/routes/produit.routes.ts` (schémas de validation)
- `src/middlewares/validation.middleware.ts` (normalisation des champs)

**Lié à :**
- CORRECTION_MAJORATION_TRANSACTION.md (corrections de la majoration 4.5%)

