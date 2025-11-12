# Guide des Paiements Partiels

## Vue d'ensemble

Le système supporte maintenant les paiements partiels, permettant de diviser le paiement d'une commande en plusieurs transactions (acompte, frais de livraison, solde).

## Installation

### 1. Exécuter la migration SQL

Exécutez le fichier `migrations/003_add_partial_payments_support.sql` dans votre base de données Supabase.

Cette migration:
- ✅ Ajoute `montant_paye` et `montant_restant` à la table `commandes`
- ✅ Ajoute `type_paiement` et `description` à la table `transactions`
- ✅ Crée un trigger automatique pour calculer `montant_restant`
- ✅ Crée un trigger pour recalculer `montant_paye` à chaque transaction
- ✅ Ajoute le nouveau statut `partiellement_paye`

### 2. Types de paiement disponibles

```typescript
type TypePaiement = 
  | 'paiement_complet'        // Paiement en une seule fois
  | 'acompte'                 // Premier versement partiel
  | 'frais_livraison'         // Paiement des frais de livraison uniquement
  | 'solde_apres_livraison'   // Paiement du reste après livraison
  | 'complement'              // Complément de paiement
```

### 3. Statuts de paiement étendus

```typescript
type StatutPaiement = 
  | 'en_attente'              // Aucun paiement reçu
  | 'partiellement_paye'      // Au moins un paiement partiel reçu
  | 'paye'                    // Montant total payé
  | 'echec'                   // Paiement échoué
  | 'rembourse'               // Commande remboursée
```

## Utilisation

### Scénario 1 : Payer les frais de livraison d'abord

```typescript
// Étape 1: Créer la commande (total = 25000 FCFA)
POST /api/v1/commandes
{
  "boutique_id": 1,
  "client_nom": "Jean Dupont",
  "client_telephone": "+24166123456",
  "client_adresse": "Quartier Batterie IV",
  "client_ville": "Libreville",
  "client_commune": "Akanda",
  "frais_livraison": 2500,
  "articles": [
    {
      "produit_id": 5,
      "nom_produit": "T-Shirt",
      "prix_unitaire": 22500,
      "quantite": 1,
      "sous_total": 22500
    }
  ]
}

// Réponse:
{
  "success": true,
  "commande": {
    "id": 1,
    "total": 25000,
    "montant_paye": 0,
    "montant_restant": 25000,
    "statut_paiement": "en_attente"
  }
}

// Étape 2: Payer les frais de livraison (2500 FCFA)
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 2500,
  "methode_paiement": "mobile_money",
  "type_paiement": "frais_livraison",
  "description": "Paiement des frais de livraison",
  "numero_telephone": "+24166123456"
}

// Réponse:
{
  "success": true,
  "transaction": {
    "id": 1,
    "montant": 2500,
    "type_paiement": "frais_livraison",
    "statut": "paye"
  },
  "commande": {
    "id": 1,
    "total": 25000,
    "montant_paye": 2500,
    "montant_restant": 22500,
    "statut_paiement": "partiellement_paye"
  }
}

// Étape 3: Après livraison, solder le reste (22500 FCFA)
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 22500,
  "methode_paiement": "especes",
  "type_paiement": "solde_apres_livraison",
  "description": "Paiement du solde à la livraison"
}

// Réponse:
{
  "success": true,
  "transaction": {
    "id": 2,
    "montant": 22500,
    "type_paiement": "solde_apres_livraison",
    "statut": "paye"
  },
  "commande": {
    "id": 1,
    "total": 25000,
    "montant_paye": 25000,
    "montant_restant": 0,
    "statut_paiement": "paye"  // ✅ Commande entièrement payée
  }
}
```

### Scénario 2 : Acompte puis solde

```typescript
// Étape 1: Payer un acompte de 50%
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 12500,  // 50% de 25000
  "methode_paiement": "mobile_money",
  "type_paiement": "acompte",
  "description": "Acompte de 50%",
  "numero_telephone": "+24166123456"
}

// Étape 2: Payer le reste
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 12500,
  "methode_paiement": "especes",
  "type_paiement": "complement",
  "description": "Paiement du solde"
}
```

### Scénario 3 : Paiement en plusieurs fois

```typescript
// Paiement 1: 10000 FCFA
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 10000,
  "methode_paiement": "mobile_money",
  "type_paiement": "acompte",
  "description": "Premier versement"
}

// Paiement 2: 10000 FCFA
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 10000,
  "methode_paiement": "mobile_money",
  "type_paiement": "complement",
  "description": "Deuxième versement"
}

// Paiement 3: 5000 FCFA (solde)
POST /api/v1/transactions
{
  "commande_id": 1,
  "montant": 5000,
  "methode_paiement": "especes",
  "type_paiement": "complement",
  "description": "Versement final"
}
```

## API Endpoints

### Récupérer le montant restant d'une commande

```typescript
GET /api/v1/commandes/:id

// Réponse:
{
  "success": true,
  "commande": {
    "id": 1,
    "total": 25000,
    "montant_paye": 15000,
    "montant_restant": 10000,  // ✅ Calculé automatiquement
    "statut_paiement": "partiellement_paye"
  }
}
```

### Lister toutes les transactions d'une commande

```typescript
GET /api/v1/transactions?commande_id=1

// Réponse:
{
  "success": true,
  "transactions": [
    {
      "id": 1,
      "montant": 2500,
      "type_paiement": "frais_livraison",
      "statut": "paye",
      "date_creation": "2025-11-09T10:00:00Z"
    },
    {
      "id": 2,
      "montant": 12500,
      "type_paiement": "acompte",
      "statut": "paye",
      "date_creation": "2025-11-09T11:00:00Z"
    }
  ],
  "total_paye": 15000,
  "montant_restant": 10000
}
```

## Calculs automatiques

### Trigger automatique sur les transactions

Chaque fois qu'une transaction est créée, mise à jour ou supprimée :
1. Le `montant_paye` de la commande est recalculé automatiquement
2. Le `montant_restant` est mis à jour (total - montant_paye)
3. Le `statut_paiement` est ajusté automatiquement :
   - Si `montant_paye = 0` → `en_attente`
   - Si `0 < montant_paye < total` → `partiellement_paye`
   - Si `montant_paye >= total` → `paye`

### Méthodes du modèle

```typescript
// Recalculer manuellement le montant payé
await CommandeModel.recalculerMontantPaye(commandeId);

// Vérifier si une commande est entièrement payée
const isPaid = await CommandeModel.isCommandeEntierementPayee(commandeId);

// Obtenir le montant restant
const montantRestant = await CommandeModel.getMontantRestant(commandeId);
```

## Sécurité et validation

### Règles métier

1. **Le montant d'une transaction ne peut pas dépasser le montant restant**
   ```typescript
   if (montantTransaction > commande.montant_restant) {
     throw new Error('Le montant dépasse le montant restant à payer');
   }
   ```

2. **Une commande déjà payée ne peut plus recevoir de paiements**
   ```typescript
   if (commande.statut_paiement === 'paye') {
     throw new Error('Cette commande est déjà entièrement payée');
   }
   ```

3. **Toutes les transactions sont tracées**
   - Chaque transaction a une `reference_transaction` unique
   - Les dates de création et confirmation sont enregistrées
   - L'historique complet est conservé

## Migration des données existantes

La migration SQL met automatiquement à jour toutes les commandes existantes :
- `montant_paye` = somme des transactions payées
- `montant_restant` = total - montant_paye
- `statut_paiement` ajusté selon le montant payé

## Support

Pour toute question ou problème, consultez la documentation complète ou contactez l'équipe technique.

