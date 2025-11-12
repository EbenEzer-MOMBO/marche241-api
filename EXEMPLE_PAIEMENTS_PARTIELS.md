# Exemple d'implémentation - Paiements Partiels

## Modification du contrôleur de transaction pour supporter les paiements partiels

### 1. Validation avant création de transaction

Ajoutez cette validation dans `TransactionController.createTransaction` :

```typescript
static async createTransaction(req: Request, res: Response): Promise<void> {
  try {
    const { commande_id, montant, type_paiement, ...transactionData } = req.body;
    
    // Récupérer la commande
    const commande = await CommandeModel.getCommandeById(commande_id);
    if (!commande) {
      res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
      return;
    }
    
    // Vérifier que la commande n'est pas déjà entièrement payée
    if (commande.statut_paiement === 'paye') {
      res.status(400).json({
        success: false,
        message: 'Cette commande est déjà entièrement payée',
        commande: {
          total: commande.total,
          montant_paye: commande.montant_paye,
          montant_restant: commande.montant_restant
        }
      });
      return;
    }
    
    // Vérifier que le montant ne dépasse pas le montant restant
    if (montant > commande.montant_restant) {
      res.status(400).json({
        success: false,
        message: `Le montant (${montant}) dépasse le montant restant à payer (${commande.montant_restant})`,
        montant_maximum: commande.montant_restant
      });
      return;
    }
    
    // Créer la transaction avec le type de paiement
    const transaction = await TransactionModel.createTransaction({
      commande_id,
      montant,
      type_paiement: type_paiement || 'paiement_complet',
      ...transactionData
    });
    
    // Récupérer la commande mise à jour (avec les montants recalculés)
    const commandeMiseAJour = await CommandeModel.getCommandeById(commande_id);
    
    res.status(201).json({
      success: true,
      message: 'Transaction créée avec succès',
      transaction,
      commande: {
        id: commandeMiseAJour!.id,
        total: commandeMiseAJour!.total,
        montant_paye: commandeMiseAJour!.montant_paye,
        montant_restant: commandeMiseAJour!.montant_restant,
        statut_paiement: commandeMiseAJour!.statut_paiement
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la transaction',
      error: error.message
    });
  }
}
```

### 2. Endpoint pour obtenir le résumé des paiements

Ajoutez cette méthode dans `CommandeController` :

```typescript
static async getResumePaiements(req: Request, res: Response): Promise<void> {
  try {
    const commandeId = parseInt(req.params.id);
    
    if (isNaN(commandeId)) {
      res.status(400).json({
        success: false,
        message: 'ID de commande invalide'
      });
      return;
    }
    
    // Récupérer la commande
    const commande = await CommandeModel.getCommandeById(commandeId);
    if (!commande) {
      res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
      return;
    }
    
    // Récupérer toutes les transactions de la commande
    const transactions = await TransactionModel.getTransactionsByCommandeId(commandeId);
    
    // Calculer les statistiques par type de paiement
    const parementsParType = transactions.reduce((acc, t) => {
      if (t.statut === 'paye') {
        if (!acc[t.type_paiement]) {
          acc[t.type_paiement] = {
            montant_total: 0,
            nombre_transactions: 0
          };
        }
        acc[t.type_paiement].montant_total += t.montant;
        acc[t.type_paiement].nombre_transactions += 1;
      }
      return acc;
    }, {} as Record<string, { montant_total: number; nombre_transactions: number }>);
    
    res.status(200).json({
      success: true,
      commande: {
        id: commande.id,
        numero_commande: commande.numero_commande,
        total: commande.total,
        montant_paye: commande.montant_paye,
        montant_restant: commande.montant_restant,
        statut_paiement: commande.statut_paiement,
        pourcentage_paye: Math.round((commande.montant_paye / commande.total) * 100)
      },
      transactions: transactions.map(t => ({
        id: t.id,
        montant: t.montant,
        type_paiement: t.type_paiement,
        methode_paiement: t.methode_paiement,
        statut: t.statut,
        description: t.description,
        date_creation: t.date_creation,
        date_confirmation: t.date_confirmation
      })),
      statistiques: {
        nombre_total_transactions: transactions.length,
        nombre_transactions_payees: transactions.filter(t => t.statut === 'paye').length,
        paiements_par_type: parementsParType
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du résumé des paiements',
      error: error.message
    });
  }
}
```

### 3. Route pour le résumé des paiements

Ajoutez dans `src/routes/commande.routes.ts` :

```typescript
router.get('/:id/resume-paiements', auth, CommandeController.getResumePaiements);
```

## Tests Postman/Thunder Client

### Test 1 : Créer une commande

```http
POST http://localhost:3000/api/v1/commandes
Content-Type: application/json

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
      "quantite": 1
    }
  ]
}
```

### Test 2 : Payer les frais de livraison

```http
POST http://localhost:3000/api/v1/transactions
Content-Type: application/json

{
  "commande_id": 1,
  "montant": 2500,
  "methode_paiement": "mobile_money",
  "type_paiement": "frais_livraison",
  "description": "Paiement des frais de livraison",
  "numero_telephone": "+24166123456",
  "statut": "paye"
}
```

### Test 3 : Vérifier le résumé des paiements

```http
GET http://localhost:3000/api/v1/commandes/1/resume-paiements
```

Résultat attendu:

```json
{
  "success": true,
  "commande": {
    "id": 1,
    "numero_commande": "COM-2025-11001",
    "total": 25000,
    "montant_paye": 2500,
    "montant_restant": 22500,
    "statut_paiement": "partiellement_paye",
    "pourcentage_paye": 10
  },
  "transactions": [
    {
      "id": 1,
      "montant": 2500,
      "type_paiement": "frais_livraison",
      "methode_paiement": "mobile_money",
      "statut": "paye",
      "description": "Paiement des frais de livraison",
      "date_creation": "2025-11-09T10:00:00Z",
      "date_confirmation": "2025-11-09T10:01:00Z"
    }
  ],
  "statistiques": {
    "nombre_total_transactions": 1,
    "nombre_transactions_payees": 1,
    "paiements_par_type": {
      "frais_livraison": {
        "montant_total": 2500,
        "nombre_transactions": 1
      }
    }
  }
}
```

### Test 4 : Payer le solde après livraison

```http
POST http://localhost:3000/api/v1/transactions
Content-Type: application/json

{
  "commande_id": 1,
  "montant": 22500,
  "methode_paiement": "especes",
  "type_paiement": "solde_apres_livraison",
  "description": "Paiement du solde à la livraison",
  "statut": "paye"
}
```

### Test 5 : Tenter de payer plus que le montant restant (doit échouer)

```http
POST http://localhost:3000/api/v1/transactions
Content-Type: application/json

{
  "commande_id": 1,
  "montant": 30000,
  "methode_paiement": "mobile_money",
  "type_paiement": "complement",
  "statut": "paye"
}
```

Résultat attendu (erreur 400):

```json
{
  "success": false,
  "message": "Le montant (30000) dépasse le montant restant à payer (22500)",
  "montant_maximum": 22500
}
```

## Checklist d'implémentation

- [x] ✅ Migration SQL exécutée
- [x] ✅ Types TypeScript mis à jour
- [x] ✅ Modèle CommandeModel étendu avec nouvelles méthodes
- [ ] 🔲 Validation dans TransactionController.createTransaction
- [ ] 🔲 Méthode getResumePaiements ajoutée dans CommandeController
- [ ] 🔲 Route /commandes/:id/resume-paiements ajoutée
- [ ] 🔲 Tests effectués
- [ ] 🔲 Documentation mise à jour

## Notes importantes

1. **Les triggers SQL gèrent automatiquement** :
   - Le calcul de `montant_restant`
   - La mise à jour de `montant_paye` quand une transaction change
   - Le changement automatique de `statut_paiement`

2. **Pas besoin de recalculer manuellement** sauf dans des cas exceptionnels

3. **Le système est rétrocompatible** :
   - Les anciennes commandes avec paiement unique fonctionnent toujours
   - Le type_paiement par défaut est `paiement_complet`

4. **Pour le frontend** :
   - Afficher le pourcentage de paiement : `(montant_paye / total) * 100`
   - Afficher une barre de progression
   - Montrer la liste des transactions avec leur type

