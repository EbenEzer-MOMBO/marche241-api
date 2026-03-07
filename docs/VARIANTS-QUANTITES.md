# Gestion des Variants de Produit

## Vue d'ensemble

Le système de gestion des produits utilise une structure moderne de variants permettant de gérer différents types de produits (vêtements, chaussures, électronique, beauté, etc.) avec leurs variantes spécifiques.

### Types de Produits Supportés

1. **Vêtements** (`type: "vetements"`)
   - Variants avec couleurs et tailles
   - Stock géré par taille pour chaque couleur

2. **Chaussures** (`type: "chaussures"`)
   - Variants avec couleurs et pointures
   - Stock géré par pointure pour chaque couleur

3. **Produits Génériques** (`type: "electronique"`, `"beaute"`, `"bijoux"`, `"livres"`, `"sport"`, `"services"`)
   - Variants avec attributs personnalisables
   - Stock géré directement au niveau du variant

## Structure des Données

### Format JSON des Variants

#### 1. Vêtements / Chaussures

```json
{
  "type": "vetements",  // ou "chaussures"
  "variants": [
    {
      "id": "variant_1772238330583",
      "couleur": "Marron",
      "image": "https://...",
      "prix": 12000,
      "prix_promo": 10000,  // optionnel
      "tailles": [
        { "taille": "M", "stock": 10 },
        { "taille": "L", "stock": 8 },
        { "taille": "XL", "stock": 5 }
      ]
    },
    {
      "id": "variant_1772238330584",
      "couleur": "Noir",
      "image": "https://...",
      "prix": 12000,
      "tailles": [
        { "taille": "M", "stock": 15 },
        { "taille": "L", "stock": 12 }
      ]
    }
  ]
}
```

#### 2. Produits Génériques

```json
{
  "type": "electronique",  // ou "beaute", "bijoux", "livres", "sport", "services"
  "variants": [
    {
      "id": "variant_123456789",
      "nom": "Noir - Sans fil",
      "image": "https://...",
      "prix": 25000,
      "stock": 15,
      "attributes": [
        { "type": "Couleur", "value": "Noir" },
        { "type": "Type", "value": "Sans fil" }
      ]
    },
    {
      "id": "variant_123456790",
      "nom": "Blanc - Sans fil",
      "image": "https://...",
      "prix": 25000,
      "stock": 10,
      "attributes": [
        { "type": "Couleur", "value": "Blanc" },
        { "type": "Type", "value": "Sans fil" }
      ]
    }
  ]
}
```

### Propriétés Communes

- **`type`** (string) : Le type de produit (obligatoire)
- **`variants`** (array) : La liste des variants du produit

### Propriétés des Variants

**Pour Vêtements/Chaussures :**
- **`id`** (string) : Identifiant unique du variant
- **`couleur`** (string) : Couleur du variant
- **`image`** (string) : URL de l'image du variant (optionnel)
- **`prix`** (number) : Prix du variant
- **`prix_promo`** (number) : Prix promotionnel (optionnel)
- **`tailles`** (array) : Liste des tailles avec leur stock
  - **`taille`** (string) : Taille (ex: "M", "L", "XL") ou Pointure (ex: "39", "40")
  - **`stock`** (number) : Quantité disponible pour cette taille

**Pour Produits Génériques :**
- **`id`** (string) : Identifiant unique du variant
- **`nom`** (string) : Nom descriptif du variant
- **`image`** (string) : URL de l'image du variant (optionnel)
- **`prix`** (number) : Prix du variant
- **`stock`** (number) : Quantité disponible
- **`attributes`** (array) : Liste des attributs du variant
  - **`type`** (string) : Type d'attribut (ex: "Couleur", "Taille", "Capacité")
  - **`value`** (string) : Valeur de l'attribut

## Calcul du Stock Total

Le stock total est calculé automatiquement en additionnant tous les stocks de tous les variants :

### Pour Vêtements/Chaussures

```typescript
const stockTotal = variants.variants.reduce((total, variant) => {
  const stockVariant = variant.tailles.reduce((sum, taille) => sum + taille.stock, 0);
  return total + stockVariant;
}, 0);
```

### Pour Produits Génériques

```typescript
const stockTotal = variants.variants.reduce((total, variant) => {
  return total + variant.stock;
}, 0);
```

### Exemples

**Vêtement avec 2 couleurs :**
```
Couleur Marron:
- Taille M : 10 unités
- Taille L : 8 unités
- Taille XL : 5 unités
Sous-total Marron: 23 unités

Couleur Noir:
- Taille M : 15 unités
- Taille L : 12 unités
Sous-total Noir: 27 unités

Stock total = 23 + 27 = 50 unités
```

**Produit Générique avec 2 variants :**
```
Variant 1 (Noir - Sans fil): 15 unités
Variant 2 (Blanc - Sans fil): 10 unités

Stock total = 15 + 10 = 25 unités
```

## Gestion des Stocks

### Validation

- Les stocks ne peuvent pas être négatifs (minimum: 0)
- Chaque variant doit avoir au moins une taille/attribut
- Les stocks sont saisis lors de la création/modification du produit

### Points Importants

1. **Calcul Automatique** : Le stock total se calcule automatiquement
2. **Identification Unique** : Chaque variant a un ID unique pour la gestion précise du stock
3. **Flexibilité** : Support de multiples variants avec différents prix et images
4. **Validation** : Protection contre les valeurs négatives et les données invalides
5. **Traçabilité** : Utilisation de l'ID du variant pour le suivi des ventes

## API Backend

### Format d'Envoi lors de la Création/Modification

```json
{
  "nom": "T-Shirt Premium",
  "prix": 15000,
  "en_stock": 21,
  "quantite_stock": 21,
  "variants": [
    {
      "nom": "Type",
      "options": ["A", "B", "C", "D"],
      "quantites": [8, 8, 4, 1]
    }
  ]
}
```

### Champs Importants

- `en_stock` et `quantite_stock` contiennent la même valeur (stock total calculé)
- `variants` contient le tableau complet avec les quantités
- Le backend peut utiliser ces données pour la gestion avancée des stocks

### Format d'Envoi lors d'une Commande

Lorsqu'un client passe commande, le système envoie les informations suivantes pour chaque produit :

```json
{
  "produit_id": 120,
  "quantite": 1,
  "prix_unitaire": 12000,
  "variants_selectionnes": {
    "variant": {
      "id": "variant_1772238330583",
      "nom": "Marron - Taille XL",
      "prix": 12000,
      "image": "https://..."
    }
  }
}
```

**Important** : Le champ `variant.id` contient l'identifiant unique du variant sélectionné.

### Logique de Décrémentation Backend

Le backend doit implémenter la logique suivante lors de la validation d'une commande :

#### Structure Moderne des Variants

```json
{
  "variants": {
    "type": "vetements",
    "variants": [
      {
        "id": "variant_1772238330583",
        "couleur": "Marron",
        "tailles": [
          { "taille": "M", "stock": 10 },
          { "taille": "L", "stock": 8 },
          { "taille": "XL", "stock": 5 }
        ],
        "prix": 12000
      }
    ]
  }
}
```

**Action** :
- Utiliser le `variant.id` du panier pour identifier le variant exact
- Pour les vêtements/chaussures : extraire la taille du `variant.nom` (ex: "Marron - Taille XL")
- Pour les produits génériques : décrémenter directement le stock du variant
- Trouver l'objet correspondant et décrémenter le champ `stock`
- Recalculer le stock total de tous les variants

**Exemples** :

**1. Vêtements/Chaussures :**
```
Commande : 1 unité de variant "variant_1772238330583" - Taille XL
Avant : { "taille": "XL", "stock": 5 }
Après : { "taille": "XL", "stock": 4 }
Stock total du variant avant : 23 → après : 22
```

**2. Produits Génériques :**
```
Commande : 2 unités de variant "variant_123456789"
Avant : { "id": "variant_123456789", "stock": 10, "attributes": [...] }
Après : { "id": "variant_123456789", "stock": 8, "attributes": [...] }
```

#### Algorithme de Décrémentation

```pseudo
FUNCTION decrementerStock(produit, commande_item):
  variants = produit.variants
  quantite_commandee = commande_item.quantite
  variant_selectionne = commande_item.variants_selectionnes.variant
  variant_id = variant_selectionne.id
  
  // Vérifier que variants existe et a la bonne structure
  IF NOT variants OR NOT variants.type OR NOT variants.variants:
    THROW "Structure de variants invalide"
  END IF
  
  // Trouver le variant par son ID
  variant = trouver_variant_par_id(variants.variants, variant_id)
  
  IF NOT variant:
    THROW "Variant non trouvé: " + variant_id
  END IF
  
  // Cas 1 : Vêtements ou Chaussures (avec tailles)
  IF variants.type == "vetements" OR variants.type == "chaussures":
    taille = extraire_taille(variant_selectionne.nom)
    taille_obj = trouver_taille(variant.tailles, taille)
    
    IF NOT taille_obj:
      THROW "Taille non trouvée: " + taille
    END IF
    
    IF taille_obj.stock >= quantite_commandee:
      taille_obj.stock -= quantite_commandee
      nouveau_stock_total = recalculer_stock_total(variants)
      RETURN nouveau_stock_total
    ELSE:
      THROW "Stock insuffisant pour " + variant_selectionne.nom
    END IF
  
  // Cas 2 : Produits Génériques (sans tailles)
  ELSE:
    IF variant.stock >= quantite_commandee:
      variant.stock -= quantite_commandee
      nouveau_stock_total = recalculer_stock_total(variants)
      RETURN nouveau_stock_total
    ELSE:
      THROW "Stock insuffisant pour le variant"
    END IF
  END IF
END FUNCTION

FUNCTION trouver_variant_par_id(variants_array, variant_id):
  FOR EACH variant IN variants_array:
    IF variant.id == variant_id:
      RETURN variant
    END IF
  END FOR
  RETURN NULL
END FUNCTION

FUNCTION recalculer_stock_total(variants):
  total = 0
  
  FOR EACH variant IN variants.variants:
    IF variant.tailles EXISTS AND IS_ARRAY(variant.tailles):
      // Vêtements/Chaussures : additionner le stock de toutes les tailles
      FOR EACH taille IN variant.tailles:
        total += taille.stock
      END FOR
    ELSE IF variant.stock EXISTS:
      // Générique : ajouter directement le stock du variant
      total += variant.stock
    END IF
  END FOR
  
  RETURN total
END FUNCTION
```

#### Extraction des Informations

**Pour extraire la taille du nom du variant :**

```pseudo
// Exemples de noms :
// - "Marron - Taille XL"
// - "Noir - Pointure 42"
// - "Rouge - Taille M"

FUNCTION extraire_taille(nom_variant):
  // Pour les vêtements
  IF nom_variant CONTAINS " - Taille ":
    parts = SPLIT(nom_variant, " - Taille ")
    RETURN TRIM(parts[1])  // Ex: "XL"
  
  // Pour les chaussures
  ELSE IF nom_variant CONTAINS " - Pointure ":
    parts = SPLIT(nom_variant, " - Pointure ")
    RETURN TRIM(parts[1])  // Ex: "42"
  
  // Fallback : retourner le nom complet
  ELSE:
    RETURN nom_variant
  END IF
END FUNCTION

FUNCTION trouver_taille(tailles_array, taille_recherchee):
  FOR EACH taille_obj IN tailles_array:
    IF taille_obj.taille == taille_recherchee:
      RETURN taille_obj
    END IF
  END FOR
  RETURN NULL
END FUNCTION
```

#### Mise à Jour de la Base de Données

```sql
-- Après décrémentation
UPDATE produits 
SET 
  variants = @variants_json_updated,
  en_stock = @stock_total_recalcule,
  quantite_stock = @stock_total_recalcule,
  date_modification = NOW()
WHERE id = @produit_id;
```

### Points Critiques

1. **Vérification du Stock** : Toujours vérifier que le stock est suffisant avant de décrémenter
2. **Transaction Atomique** : Envelopper la décrémentation dans une transaction pour éviter les conditions de course
3. **Lock Pessimiste** : Utiliser `SELECT ... FOR UPDATE` pour verrouiller le produit pendant la mise à jour
4. **Recalcul Systématique** : Toujours recalculer le stock total après décrémentation
5. **Logging** : Enregistrer chaque modification de stock pour l'audit
6. **Validation de Structure** : Vérifier que la structure `variants` est valide avant traitement

### Exemple d'Implémentation SQL avec Transaction

```sql
BEGIN TRANSACTION;

-- 1. Verrouiller le produit pour éviter les modifications concurrentes
SELECT id, variants, en_stock 
FROM produits 
WHERE id = @produit_id 
FOR UPDATE;

-- 2. Décrémenter le stock (logique applicative en PHP/Node/etc.)
-- variants_updated = decrementerStock(variants, commande_item)
-- stock_recalcule = recalculer_stock_total(variants_updated)

-- 3. Mettre à jour le produit
UPDATE produits 
SET 
  variants = @variants_updated,
  en_stock = @stock_recalcule,
  quantite_stock = @stock_recalcule,
  date_modification = NOW()
WHERE id = @produit_id;

-- 4. Logger la modification
INSERT INTO historique_stock (produit_id, variant_id, quantite_avant, quantite_apres, date_modification)
VALUES (@produit_id, @variant_id, @stock_avant, @stock_apres, NOW());

COMMIT;
```

### Gestion des Erreurs

Le backend doit retourner des erreurs explicites :

**Stock insuffisant :**
```json
{
  "success": false,
  "error_code": "STOCK_INSUFFISANT",
  "message": "Stock insuffisant pour le variant 'Marron - Taille XL'",
  "details": {
    "produit_id": 120,
    "variant_id": "variant_1772238330583",
    "taille": "XL",
    "stock_disponible": 2,
    "quantite_demandee": 5
  }
}
```

**Variant non trouvé :**
```json
{
  "success": false,
  "error_code": "VARIANT_NON_TROUVE",
  "message": "Le variant demandé n'existe pas",
  "details": {
    "produit_id": 120,
    "variant_id": "variant_invalid_123"
  }
}
```

**Structure invalide :**
```json
{
  "success": false,
  "error_code": "STRUCTURE_INVALIDE",
  "message": "La structure des variants du produit est invalide",
  "details": {
    "produit_id": 120
  }
}
```

### Exemples Complets par Type de Produit

#### 1. Vêtement (type: "vetements")

**Produit avant commande :**
```json
{
  "id": 120,
  "nom": "Hoodie TopBoy",
  "variants": {
    "type": "vetements",
    "variants": [
      {
        "id": "variant_1772238330583",
        "couleur": "Marron",
        "image": "https://...",
        "prix": 12000,
        "tailles": [
          { "taille": "M", "stock": 10 },
          { "taille": "L", "stock": 8 },
          { "taille": "XL", "stock": 5 }
        ]
      },
      {
        "id": "variant_1772238330584",
        "couleur": "Noir",
        "image": "https://...",
        "prix": 12000,
        "tailles": [
          { "taille": "M", "stock": 15 },
          { "taille": "L", "stock": 12 },
          { "taille": "XL", "stock": 8 }
        ]
      }
    ]
  },
  "en_stock": 58
}
```

**Commande :**
```json
{
  "produit_id": 120,
  "quantite": 2,
  "variants_selectionnes": {
    "variant": {
      "id": "variant_1772238330583",
      "nom": "Marron - Taille XL"
    }
  }
}
```

**Produit après commande :**
```json
{
  "id": 120,
  "variants": {
    "type": "vetements",
    "variants": [
      {
        "id": "variant_1772238330583",
        "couleur": "Marron",
        "tailles": [
          { "taille": "M", "stock": 10 },
          { "taille": "L", "stock": 8 },
          { "taille": "XL", "stock": 3 }  // 5 - 2 = 3
        ]
      },
      {
        "id": "variant_1772238330584",
        "couleur": "Noir",
        "tailles": [
          { "taille": "M", "stock": 15 },
          { "taille": "L", "stock": 12 },
          { "taille": "XL", "stock": 8 }
        ]
      }
    ]
  },
  "en_stock": 56  // 58 - 2 = 56
}
```

#### 2. Produit Générique (type: "electronique", "beaute", etc.)

**Produit avant commande :**
```json
{
  "id": 250,
  "nom": "Écouteurs Bluetooth",
  "variants": {
    "type": "electronique",
    "variants": [
      {
        "id": "variant_123456789",
        "nom": "Noir - Sans fil",
        "image": "https://...",
        "prix": 25000,
        "stock": 15,
        "attributes": [
          { "type": "Couleur", "value": "Noir" },
          { "type": "Type", "value": "Sans fil" }
        ]
      },
      {
        "id": "variant_123456790",
        "nom": "Blanc - Sans fil",
        "image": "https://...",
        "prix": 25000,
        "stock": 10,
        "attributes": [
          { "type": "Couleur", "value": "Blanc" },
          { "type": "Type", "value": "Sans fil" }
        ]
      }
    ]
  },
  "en_stock": 25
}
```

**Commande :**
```json
{
  "produit_id": 250,
  "quantite": 3,
  "variants_selectionnes": {
    "variant": {
      "id": "variant_123456789",
      "nom": "Noir - Sans fil"
    }
  }
}
```

**Produit après commande :**
```json
{
  "id": 250,
  "variants": {
    "type": "electronique",
    "variants": [
      {
        "id": "variant_123456789",
        "stock": 12,  // 15 - 3 = 12
        "attributes": [...]
      },
      {
        "id": "variant_123456790",
        "stock": 10,
        "attributes": [...]
      }
    ]
  },
  "en_stock": 22  // 25 - 3 = 22
}
```



## Résumé

Cette documentation décrit la structure moderne de gestion des variants de produits. Le système supporte :

- ✅ Trois types de produits : vêtements, chaussures, et génériques
- ✅ Gestion du stock au niveau des tailles/attributs
- ✅ Identification unique de chaque variant via un ID
- ✅ Calcul automatique du stock total
- ✅ Support de prix et images différents par variant
- ✅ Décrémentation précise du stock lors des commandes

Le backend doit impérativement suivre les algorithmes de décrémentation décrits ci-dessus pour garantir l'intégrité des stocks.

---

**Document mis à jour le :** 2026-03-07  
**Version :** 2.0 (Structure moderne uniquement)