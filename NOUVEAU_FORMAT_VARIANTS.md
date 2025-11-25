# Nouveau Format des Variants

## 📋 Vue d'ensemble

Le système de variants a été mis à jour pour supporter un format plus flexible et structuré, permettant de gérer à la fois des variants de produits (couleur, taille, etc.) et des options personnalisables (message, texte, etc.).

---

## 🔄 Changement de Format

### ❌ Ancien Format (Déprécié)

```json
{
  "variants": [
    {
      "nom": "Type",
      "options": ["A", "B"],
      "quantites": [8, 5]
    }
  ]
}
```

### ✅ Nouveau Format

```json
{
  "variants": {
    "variants": [
      {
        "nom": "Rouge",
        "quantite": 10,
        "prix": 5000,
        "prix_promo": 4500,
        "image": "https://example.com/rouge.jpg"
      },
      {
        "nom": "Bleu",
        "quantite": 5,
        "prix": 5000,
        "prix_promo": 4500,
        "image": "https://example.com/bleu.jpg"
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

---

## 📦 Structure du Produit

### Champs `variants`

Le champ `variants` du produit contient maintenant deux sous-structures :

#### 1. `variants` (Array)
Liste des variants physiques du produit (couleur, taille, modèle, etc.)

**Propriétés de chaque variant :**
- `nom` (string, required) : Nom du variant (ex: "Rouge", "Taille L")
- `quantite` (number, required) : Stock disponible pour ce variant
- `prix` (number, required) : Prix du variant
- `prix_promo` (number, optional) : Prix promotionnel si applicable
- `prix_original` (number, optional) : Prix original avant réduction
- `image` (string, optional) : URL de l'image spécifique au variant

```json
{
  "nom": "Rouge",
  "quantite": 10,
  "prix": 5000,
  "prix_promo": 4500,
  "image": "https://example.com/rouge.jpg"
}
```

#### 2. `options` (Array)
Liste des options personnalisables que le client peut renseigner

**Propriétés de chaque option :**
- `nom` (string, required) : Nom de l'option (ex: "Message personnalisé")
- `type` (string, required) : Type d'input ("texte", "checkbox", "select", etc.)
- `required` (boolean, required) : Si l'option est obligatoire
- `choices` (array, optional) : Liste des choix si type = "select"

```json
{
  "nom": "Message personnalisé",
  "type": "texte",
  "required": true
}
```

---

## 🛒 Structure dans le Panier

### Format `variants_selectionnes`

Lorsqu'un produit est ajouté au panier, les variants sélectionnés sont stockés ainsi :

```json
{
  "variants_selectionnes": {
    "variant": {
      "nom": "Rouge",
      "prix": 5000,
      "prix_promo": 4500,
      "image": "https://example.com/rouge.jpg"
    },
    "options": {
      "Message personnalisé": "Joyeux anniversaire!",
      "Emballage cadeau": true,
      "nombre de plats": "3"
    }
  }
}
```

**Structure :**
- `variant` (object, optional) : Le variant sélectionné (copie des données du variant choisi)
- `options` (object, optional) : Map des options avec leurs valeurs saisies par le client

---

## 🔧 Exemples d'Utilisation

### Exemple 1 : Produit avec Variants Simples

**Produit : T-shirt**

```json
{
  "id": 123,
  "nom": "T-shirt Premium",
  "prix": 5000,
  "quantite_stock": 50,
  "variants": {
    "variants": [
      {
        "nom": "Rouge - S",
        "quantite": 10,
        "prix": 5000,
        "image": "https://example.com/tshirt-rouge-s.jpg"
      },
      {
        "nom": "Rouge - M",
        "quantite": 15,
        "prix": 5000,
        "image": "https://example.com/tshirt-rouge-m.jpg"
      },
      {
        "nom": "Bleu - S",
        "quantite": 8,
        "prix": 5000,
        "image": "https://example.com/tshirt-bleu-s.jpg"
      }
    ],
    "options": []
  }
}
```

**Ajout au panier :**

```bash
POST /api/v1/panier
```

```json
{
  "session_id": "session_abc123",
  "boutique_id": 1,
  "produit_id": 123,
  "quantite": 2,
  "variants_selectionnes": {
    "variant": {
      "nom": "Rouge - M",
      "prix": 5000,
      "image": "https://example.com/tshirt-rouge-m.jpg"
    }
  }
}
```

### Exemple 2 : Produit avec Variants et Options

**Produit : Gâteau Personnalisé**

```json
{
  "id": 456,
  "nom": "Gâteau d'anniversaire",
  "prix": 15000,
  "quantite_stock": 20,
  "variants": {
    "variants": [
      {
        "nom": "Chocolat",
        "quantite": 10,
        "prix": 15000,
        "image": "https://example.com/gateau-chocolat.jpg"
      },
      {
        "nom": "Vanille",
        "quantite": 10,
        "prix": 15000,
        "image": "https://example.com/gateau-vanille.jpg"
      }
    ],
    "options": [
      {
        "nom": "Message sur le gâteau",
        "type": "texte",
        "required": true
      },
      {
        "nom": "Nombre de bougies",
        "type": "select",
        "required": true,
        "choices": ["1", "5", "10", "18", "30", "50"]
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

**Ajout au panier :**

```json
{
  "session_id": "session_xyz789",
  "boutique_id": 1,
  "produit_id": 456,
  "quantite": 1,
  "variants_selectionnes": {
    "variant": {
      "nom": "Chocolat",
      "prix": 15000,
      "image": "https://example.com/gateau-chocolat.jpg"
    },
    "options": {
      "Message sur le gâteau": "Bon anniversaire Julie!",
      "Nombre de bougies": "30",
      "Emballage cadeau": true
    }
  }
}
```

### Exemple 3 : Produit Sans Variants

**Produit : Livre**

```json
{
  "id": 789,
  "nom": "Guide du développeur",
  "prix": 8000,
  "quantite_stock": 100,
  "variants": null
}
```

**Ajout au panier :**

```json
{
  "session_id": "session_def456",
  "boutique_id": 1,
  "produit_id": 789,
  "quantite": 1
}
```

---

## 🔍 Gestion du Stock

### Calcul du Stock Disponible

Le système calcule le stock disponible selon cette logique :

1. **Sans variant sélectionné** : Stock = `produit.quantite_stock`
2. **Avec variant sélectionné** : Stock = `min(produit.quantite_stock, variant.quantite)`

**Exemple de code (simplifié) :**

```typescript
let stockDisponible = produit.quantite_stock || 0;

if (variants_selectionnes?.variant && produit.variants?.variants) {
  const variantProduit = produit.variants.variants.find(
    v => v.nom === variants_selectionnes.variant.nom
  );
  
  if (variantProduit?.quantite) {
    stockDisponible = Math.min(stockDisponible, variantProduit.quantite);
  }
}
```

### Vérifications Automatiques

Le système effectue automatiquement les vérifications suivantes :

1. **Disponibilité du produit** : Le produit doit être actif
2. **Stock du produit** : Le stock global doit être > 0
3. **Stock du variant** : Si un variant est sélectionné, son stock doit être > 0
4. **Quantité demandée** : La quantité ne doit pas dépasser le stock disponible

---

## 📡 API Endpoints

### GET /api/v1/panier/:sessionId

Récupère le panier avec vérification automatique des stocks.

**Comportement :**
- ✅ Supprime les produits indisponibles
- ✅ Ajuste les quantités si le stock a diminué
- ✅ Retourne des avertissements sur les changements

**Réponse :**

```json
{
  "success": true,
  "panier": [...],
  "avertissements": {
    "produitsSupprimes": [
      {
        "id": 123,
        "nom": "Produit X",
        "raison": "Produit en rupture de stock",
        "variants": { ... }
      }
    ],
    "quantitesAjustees": [
      {
        "id": 456,
        "nom": "Produit Y",
        "quantiteOriginale": 10,
        "nouvelleQuantite": 5,
        "stockDisponible": 5
      }
    ]
  }
}
```

### POST /api/v1/panier

Ajoute un produit au panier avec vérification du stock.

**Body :**

```json
{
  "session_id": "string",
  "boutique_id": number,
  "produit_id": number,
  "quantite": number,
  "variants_selectionnes": {
    "variant": { ... },
    "options": { ... }
  }
}
```

**Comportement :**
- Si le produit avec les mêmes variants existe déjà → Met à jour la quantité
- Sinon → Ajoute un nouvel item au panier

---

## 🔍 Logs de Débogage

Le système inclut des logs détaillés pour faciliter le débogage :

```
[PanierController] ===== ADD TO CART =====
[PanierController] Données reçues: { session_id, boutique_id, produit_id, quantite, variants_selectionnes }
[PanierController] Produit trouvé: { id: 123, nom: "Produit X" }
[PanierController] Format variants produit: { variants: [...], options: [...] }
[PanierController] Vérification du stock avec variants
[PanierController] Variant sélectionné: { nom: "Rouge", prix: 5000 }
[PanierController] Stock ajusté selon variant: { nom: "Rouge", quantite_variant: 10, stock_final: 10 }
[PanierController] Stock disponible final: 10
[PanierController] Produit ajouté au panier avec succès
```

---

## ⚠️ Notes Importantes

1. **Rétrocompatibilité** : L'ancien format est encore supporté mais déprécié
2. **Validation** : Le système valide automatiquement les variants sélectionnés
3. **Stock temps réel** : Le stock est vérifié à chaque opération sur le panier
4. **Images variants** : Chaque variant peut avoir sa propre image
5. **Prix variants** : Chaque variant peut avoir un prix différent

---

## 🚀 Migration

Pour migrer de l'ancien format vers le nouveau :

### Avant (Ancien format)

```json
{
  "variants": [
    {
      "nom": "Couleur",
      "options": ["Rouge", "Bleu"],
      "quantites": [10, 5]
    }
  ]
}
```

### Après (Nouveau format)

```json
{
  "variants": {
    "variants": [
      {
        "nom": "Rouge",
        "quantite": 10,
        "prix": 5000,
        "image": "url..."
      },
      {
        "nom": "Bleu",
        "quantite": 5,
        "prix": 5000,
        "image": "url..."
      }
    ],
    "options": []
  }
}
```

---

## 📞 Support

Pour toute question sur le nouveau format des variants, consultez la documentation complète ou contactez l'équipe de développement.

