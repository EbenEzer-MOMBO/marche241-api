# Migration vers le Nouveau Format des Variants - Récapitulatif

## 📋 Vue d'ensemble

Ce document récapitule toutes les modifications apportées pour supporter le nouveau format des variants dans l'ensemble du système (panier, commandes, transactions, stock).

---

## 🔄 Changement de Format

### Ancien Format (Déprécié mais toujours supporté)

```json
{
  "variants": [
    {
      "nom": "Couleur",
      "options": ["Rouge", "Bleu"],
      "quantites": [10, 5]
    },
    {
      "nom": "Taille",
      "options": ["S", "M", "L"],
      "quantites": [8, 12, 6]
    }
  ]
}
```

**Sélection dans le panier (ancien) :**
```json
{
  "variants_selectionnes": {
    "Couleur": "Rouge",
    "Taille": "M"
  }
}
```

### Nouveau Format (Recommandé)

```json
{
  "variants": {
    "variants": [
      {
        "nom": "Rouge - S",
        "quantite": 10,
        "prix": 5000,
        "prix_promo": 4500,
        "prix_original": 6000,
        "image": "https://example.com/rouge-s.jpg"
      },
      {
        "nom": "Bleu - M",
        "quantite": 5,
        "prix": 5500,
        "image": "https://example.com/bleu-m.jpg"
      }
    ],
    "options": [
      {
        "nom": "Message personnalisé",
        "type": "texte",
        "required": true
      },
      {
        "nom": "Emballage cadeau",
        "type": "checkbox",
        "required": false
      }
    ]
  }
}
```

**Sélection dans le panier (nouveau) :**
```json
{
  "variants_selectionnes": {
    "variant": {
      "nom": "Rouge - S",
      "prix": 5000,
      "prix_promo": 4500,
      "image": "https://example.com/rouge-s.jpg"
    },
    "options": {
      "Message personnalisé": "Joyeux anniversaire!",
      "Emballage cadeau": true
    }
  }
}
```

---

## 📦 Fichiers Modifiés

### 1. ✅ `src/controllers/panier.controller.ts`

#### Fonctions modifiées :
- **`getPanier()`** : Vérification du stock avec le nouveau format
- **`addToCart()`** : Ajout au panier avec support du nouveau format

**Changements clés :**
```typescript
// Nouveau code
const variantsData = produit.variants as any;

if (variants_selectionnes.variant && variantsData.variants && Array.isArray(variantsData.variants)) {
  const variantSelectionne = variants_selectionnes.variant;
  const variantProduit = variantsData.variants.find((v: any) => v.nom === variantSelectionne.nom);
  
  if (variantProduit && typeof variantProduit.quantite === 'number') {
    stockDisponible = Math.min(stockDisponible, variantProduit.quantite);
  }
}
```

**Logs ajoutés :**
- Format des variants du produit
- Variant sélectionné
- Stock calculé par variant
- Actions effectuées

---

### 2. ✅ `src/controllers/commande.controller.ts`

#### Fonctions modifiées :
- **`createCommande()`** : Vérification du stock avant création de commande
- **`initierPaiement()`** : Vérification du stock avant paiement

**Changements clés :**
```typescript
// Support du nouveau format
if (article.variants_selectionnes.variant && variantsData.variants && Array.isArray(variantsData.variants)) {
  const variantSelectionne = article.variants_selectionnes.variant;
  const variantProduit = variantsData.variants.find((v: any) => v.nom === variantSelectionne.nom);
  
  if (variantProduit && typeof variantProduit.quantite === 'number') {
    stockDisponible = Math.min(stockDisponible, variantProduit.quantite);
  }
}
// Fallback vers l'ancien format pour rétrocompatibilité
else {
  for (const [nomVariant, optionSelectionnee] of Object.entries(article.variants_selectionnes)) {
    // Code pour ancien format...
  }
}
```

**Comportement :**
- ✅ Détecte automatiquement le format (nouveau vs ancien)
- ✅ Rejette la commande si stock insuffisant
- ✅ Logs détaillés pour débogage

---

### 3. ✅ `src/models/produit.model.ts`

#### Fonction modifiée :
- **`updateStockWithVariants()`** : Mise à jour du stock des variants

**Changements clés :**
```typescript
// Détection du format
if (variantsData.variants && Array.isArray(variantsData.variants)) {
  // Nouveau format : { variants: [...], options: [...] }
  const nomVariantSelectionne = variantsSelectionnes.variant?.nom || null;
  
  for (let i = 0; i < nouveauxVariants.length; i++) {
    if (nouveauxVariants[i].nom === nomVariantSelectionne) {
      const quantiteActuelle = nouveauxVariants[i].quantite || 0;
      const nouvelleQuantite = quantiteActuelle - quantite;
      nouveauxVariants[i].quantite = nouvelleQuantite;
      break;
    }
  }
  
  // Calculer quantité totale
  const quantiteTotale = nouveauxVariants.reduce((sum, v) => sum + (v.quantite || 0), 0);
  
} else if (Array.isArray(variantsData)) {
  // Ancien format : [{ nom: "...", options: [...], quantites: [...] }]
  // Code pour ancien format...
}
```

**Comportement :**
- ✅ Support des deux formats (nouveau et ancien)
- ✅ Mise à jour du stock par variant
- ✅ Recalcul automatique du stock total
- ✅ Vérification du stock insuffisant

---

### 4. ✅ `src/models/commande.model.ts`

**Fonction existante :**
- **`updateProductsStock()`** : Appelle `ProduitModel.updateStockWithVariants()`

**Statut :** ✅ Pas de modification nécessaire
- La fonction utilise déjà `updateStockWithVariants()` qui a été mise à jour

---

## 🔍 Flux Complet

### Scénario 1 : Ajout au Panier

```
1. Client : POST /api/v1/panier
   Body: {
     "session_id": "...",
     "produit_id": 123,
     "quantite": 2,
     "variants_selectionnes": {
       "variant": { "nom": "Rouge - M", "prix": 5000, ... },
       "options": { "Message": "Joyeux anniversaire!" }
     }
   }

2. PanierController.addToCart()
   ├─ Récupère le produit
   ├─ Détecte le nouveau format
   ├─ Trouve le variant "Rouge - M"
   ├─ Vérifie le stock : variant.quantite = 10
   ├─ Vérifie : 2 <= 10 ✓
   └─ Ajoute au panier

3. Réponse : 201 Created
```

### Scénario 2 : Création de Commande

```
1. Client : POST /api/v1/commandes
   Body: {
     "articles": [
       {
         "produit_id": 123,
         "quantite": 2,
         "variants_selectionnes": {
           "variant": { "nom": "Rouge - M", ... },
           "options": { ... }
         }
       }
     ],
     ...
   }

2. CommandeController.createCommande()
   ├─ Pour chaque article :
   │  ├─ Récupère le produit
   │  ├─ Détecte le nouveau format
   │  ├─ Vérifie le stock du variant
   │  └─ Si insuffisant : rejette la commande
   ├─ Si tout OK : crée la commande
   └─ CommandeModel.updateProductsStock()
      └─ ProduitModel.updateStockWithVariants()
         ├─ Trouve le variant "Rouge - M"
         ├─ quantite actuelle : 10
         ├─ quantite à décrémenter : 2
         ├─ Nouvelle quantite : 8
         └─ Recalcule stock total

3. Stock mis à jour dans la DB
   variants.variants[0].quantite : 10 → 8
   quantite_stock : 50 → 48
```

### Scénario 3 : Paiement

```
1. Client : POST /api/v1/commandes/:id/initier-paiement

2. CommandeController.initierPaiement()
   ├─ Récupère la commande et ses articles
   ├─ Pour chaque article :
   │  ├─ Vérifie la disponibilité du produit
   │  ├─ Détecte le format des variants
   │  └─ Vérifie le stock
   ├─ Si tout OK : crée la transaction
   └─ Envoie au webhook de paiement

3. Transaction créée
```

---

## 🧪 Tests et Vérification

### Test 1 : Ajout au Panier (Nouveau Format)

```bash
POST /api/v1/panier
Content-Type: application/json

{
  "session_id": "session_test_123",
  "boutique_id": 1,
  "produit_id": 32,
  "quantite": 1,
  "variants_selectionnes": {
    "variant": {
      "nom": "Rouge - M",
      "prix": 5000,
      "image": "https://example.com/rouge-m.jpg"
    },
    "options": {
      "Message personnalisé": "Test"
    }
  }
}
```

**Logs attendus :**
```
[PanierController] ===== ADD TO CART =====
[PanierController] Données reçues: { ... }
[PanierController] Produit trouvé: { id: 32, nom: "..." }
[PanierController] Format variants produit: { variants: [...], options: [...] }
[PanierController] Vérification du stock avec variants
[PanierController] Variant sélectionné: { nom: "Rouge - M", prix: 5000 }
[PanierController] Stock ajusté selon variant: { nom: "Rouge - M", quantite_variant: 10, stock_final: 10 }
[PanierController] Stock disponible final: 10
[PanierController] Produit ajouté au panier avec succès
```

### Test 2 : Création de Commande

```bash
POST /api/v1/commandes
Content-Type: application/json

{
  "client_nom": "Test",
  "client_telephone": "+241...",
  "client_adresse": "...",
  "articles": [
    {
      "produit_id": 32,
      "quantite": 2,
      "variants_selectionnes": {
        "variant": {
          "nom": "Rouge - M",
          "prix": 5000
        }
      }
    }
  ]
}
```

**Logs attendus :**
```
[createCommande] Vérification du stock pour les variants: { variant: {...} }
[createCommande] Variant sélectionné (nouveau format): { nom: "Rouge - M", ... }
[createCommande] Stock pour variant Rouge - M: 10
[createCommande] Stock disponible calculé: 10
[createCommande] Tous les produits sont disponibles en quantité suffisante
```

### Test 3 : Vérification du Stock Après Commande

```sql
-- Requête SQL pour vérifier le stock
SELECT 
  id,
  nom,
  quantite_stock,
  variants
FROM produits
WHERE id = 32;
```

**Résultat attendu :**
```json
{
  "id": 32,
  "nom": "T-shirt Premium",
  "quantite_stock": 48,  // Était 50, décrément de 2
  "variants": {
    "variants": [
      {
        "nom": "Rouge - M",
        "quantite": 8,  // Était 10, décrément de 2
        "prix": 5000
      }
    ]
  }
}
```

---

## 🔄 Rétrocompatibilité

Le système continue de supporter l'ancien format pour :
- ✅ Les produits existants avec l'ancien format
- ✅ Les commandes en cours avec l'ancien format
- ✅ Les paniers existants avec l'ancien format

**Transition progressive :**
1. Les nouveaux produits utilisent le nouveau format
2. Les anciens produits continuent de fonctionner
3. Migration progressive possible sans interruption

---

## 📊 Avantages du Nouveau Format

### 1. **Flexibilité**
- Chaque variant peut avoir son propre prix
- Chaque variant peut avoir sa propre image
- Support des options personnalisées (texte, checkbox, select)

### 2. **Simplicité**
- Structure plus claire et intuitive
- Moins de calculs d'index
- Meilleure lisibilité

### 3. **Performance**
- Recherche par nom au lieu d'index
- Calcul du stock plus direct
- Moins de boucles imbriquées

### 4. **Extensibilité**
- Facile d'ajouter de nouvelles propriétés aux variants
- Support natif des options dynamiques
- Évolution future simplifiée

---

## ⚠️ Points d'Attention

### 1. **Format des Variants dans la DB**
Les produits peuvent avoir l'un des deux formats :
- Nouveau : `{ variants: [...], options: [...] }`
- Ancien : `[{ nom: "...", options: [...], quantites: [...] }]`

### 2. **Format de Sélection dans le Panier**
Les items du panier peuvent avoir l'un des deux formats :
- Nouveau : `{ variant: {...}, options: {...} }`
- Ancien : `{ "Couleur": "Rouge", "Taille": "M" }`

### 3. **Validation**
Le système détecte automatiquement le format et applique la logique appropriée.

### 4. **Migration**
Pour migrer un produit de l'ancien au nouveau format, utilisez l'API de mise à jour des produits avec la nouvelle structure.

---

## 🚀 Prochaines Étapes

### Court Terme
- [x] Support du nouveau format dans le panier ✅
- [x] Support dans les commandes ✅
- [x] Support dans la mise à jour du stock ✅
- [x] Logs de débogage ✅
- [x] Documentation ✅

### Moyen Terme
- [ ] Script de migration automatique (ancien → nouveau)
- [ ] Tests automatisés pour les deux formats
- [ ] Interface d'administration pour gérer les variants
- [ ] Validation stricte des variants dans les schémas Joi

### Long Terme
- [ ] Dépréciation complète de l'ancien format
- [ ] Support de variants multiples (ex: couleur + taille)
- [ ] Gestion avancée des stocks par variante
- [ ] Analytics sur les variants les plus vendus

---

## 📞 Support

Pour toute question ou problème :
1. Consultez les logs détaillés dans la console
2. Vérifiez la documentation `NOUVEAU_FORMAT_VARIANTS.md`
3. Contactez l'équipe de développement

---

**Date de migration** : 25 Novembre 2025  
**Version** : 1.0.0  
**Statut** : ✅ Déployé et fonctionnel

