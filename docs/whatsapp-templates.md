# Templates WhatsApp - Guide de référence

## 📋 Règles pour les variables

### Format des variables obligatoire :
- Lettres minuscules uniquement
- Chiffres autorisés
- Tirets bas (_) autorisés
- Format : `{{nom_variable}}`

### ❌ Formats interdits :
- `{{1}}`, `{{2}}` - Numéros
- `{{Customer_Name}}` - Majuscules
- `{{customer-name}}` - Tirets
- Pas de doublons de variables
- Trop d'emojis ou de formatage
- Variables redondantes (même valeur répétée)

### ✅ Formats valides :
- `{{customer_name}}`
- `{{order_id}}`
- `{{total_amount}}`

## 🛍️ Template : Confirmation de commande

### Nom du template : `commande_validee`
**Langue :** `fr`
**Catégorie :** `TRANSACTIONAL`

### Contenu du template :
```
🛍️ *{{shop_name1}} - Confirmation de commande*

Bonjour {{customer_name}},

Votre commande a été validée avec succès !

📋 *Détails :*
• Numéro : {{order_number}}
• Montant total : {{total_amount}} FCFA
• Date : {{order_date}}

🛒 *Produits commandés :*
{{product_list}}

📞 Nous vous contacterons bientôt pour organiser la livraison.

Merci de votre confiance !
```

### Variables définies :
1. `{{customer_name}}` - Nom du client
2. `{{order_number}}` - Numéro de commande
3. `{{total_amount}}` - Montant total
4. `{{order_date}}` - Date de commande
5. `{{product_list}}` - Liste des produits
6. `{{shop_name1}}` - Nom de la boutique

### Exemples de valeurs (pour approbation) :
1. **customer_name:** "Jean Dupont"
2. **order_number:** "CMD-2024-001"
3. **total_amount:** "15000"
4. **order_date:** "20/09/2024"
5. **product_list:** "• Bananes plantains (x2) - 3000 FCFA\n• Tomates (x1kg) - 2000 FCFA"
6. **shop_name1:** "Marché 241"

## 💻 Code TypeScript pour utiliser le template

```typescript
const message = {
  messaging_product: 'whatsapp',
  to: '24162648538',
  type: 'template',
  template: {
    name: 'commande_validee',
    language: { code: 'fr' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Jean Dupont' },           // customer_name
        { type: 'text', text: 'CMD-2024-001' },          // order_number
        { type: 'text', text: '15000' },                 // total_amount
        { type: 'text', text: '20/09/2024' },            // order_date
        { type: 'text', text: '• Bananes plantains (x2) - 3000 FCFA\n• Tomates (x1kg) - 2000 FCFA' } // product_list
        { type: 'text', text: 'Marché 241' }             // shop_name1
      ]
    }]
  }
};
```

## 🔄 Template : Notification de statut

### Nom du template : `statut_commande`
**Langue :** `fr`
**Catégorie :** `TRANSACTIONAL`

### Contenu du template :
```
{{status_emoji}} *Marché 241 - Mise à jour de commande*

Bonjour {{customer_name}},

{{status_message}}

📋 Commande : {{order_number}}

{{additional_message}}

L'équipe Marché 241
```

### Variables :
1. `{{status_emoji}}` - Emoji selon le statut
2. `{{customer_name}}` - Nom du client
3. `{{status_message}}` - Message de statut
4. `{{order_number}}` - Numéro de commande
5. `{{additional_message}}` - Message additionnel

### Exemples de valeurs :
1. **status_emoji:** "🚚"
2. **customer_name:** "Jean Dupont"
3. **status_message:** "Votre commande est en cours de livraison"
4. **order_number:** "CMD-2024-001"
5. **additional_message:** "Nous vous tiendrons informé(e) de l'évolution de votre commande."

## 📝 Notes importantes

1. **Approbation requise** : Tous les templates doivent être approuvés par Meta (24-48h)
2. **Exemples obligatoires** : Fournir des exemples pour chaque variable
3. **Respect des guidelines** : Pas de contenu promotionnel dans les templates transactionnels
4. **Test d'abord** : Utiliser `hello_world` pour tester la connexion
5. **Langue cohérente** : Utiliser `fr` pour le français (pas `fr_FR`)

## 🔧 Commandes utiles

### Tester la connexion :
```bash
POST /api/v1/whatsapp/test
{
  "telephone": "+24162648538"
}
```

### Envoyer confirmation de commande :
```bash
POST /api/v1/whatsapp/confirmation-commande
{
  "numeroCommande": "CMD-2024-001",
  "nomClient": "Jean Dupont",
  "montantTotal": 15000,
  "telephoneClient": "+24162648538",
  "produits": [...]
}
```
