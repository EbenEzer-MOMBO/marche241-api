# Guide d'Authentification API - Marché 241

## Vue d'ensemble

L'API Marché 241 utilise maintenant l'authentification par email avec codes de vérification. Ce guide explique comment utiliser les nouveaux endpoints d'authentification.

## Flux d'authentification

### 1. Création de compte vendeur

**Endpoint :** `POST /api/v1/vendeurs`

**Description :** Crée un nouveau compte vendeur. L'email sera l'identifiant unique.

**Body :**
```json
{
  "email": "vendeur@example.com",
  "nom": "Jean Dupont",
  "telephone": "+241 01 23 45 67",
  "ville": "Libreville"
}
```

**Réponse (201) :**
```json
{
  "success": true,
  "message": "Vendeur créé avec succès",
  "vendeur": {
    "id": 1,
    "email": "vendeur@example.com",
    "nom": "Jean Dupont",
    "telephone": "+241 01 23 45 67",
    "ville": "Libreville",
    "statut": "en_attente_verification",
    "date_creation": "2024-09-24T17:00:00.000Z"
  }
}
```

### 2. Demande de code de vérification

**Endpoint :** `POST /api/v1/vendeurs/code`

**Description :** Envoie un code de vérification à 6 chiffres par email. Le vendeur doit déjà avoir un compte.

**Body :**
```json
{
  "email": "vendeur@example.com"
}
```

**Réponse (200) :**
```json
{
  "success": true,
  "message": "Code de vérification envoyé par email avec succès",
  "code": "123456"
}
```

**Note :** Le champ `code` n'est présent qu'en mode développement.

### 3. Vérification du code et connexion

**Endpoint :** `POST /api/v1/vendeurs/verification`

**Description :** Vérifie le code et connecte le vendeur. Retourne un token JWT.

**Body :**
```json
{
  "email": "vendeur@example.com",
  "code": "123456"
}
```

**Réponse (200) :**
```json
{
  "success": true,
  "message": "Code de vérification valide - Connexion réussie",
  "vendeur": {
    "id": 1,
    "email": "vendeur@example.com",
    "nom": "Jean Dupont",
    "statut": "actif",
    "verification_email": true,
    "derniere_connexion": "2024-09-24T17:05:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Gestion des erreurs

### Compte inexistant

**Erreur (404) :**
```json
{
  "success": false,
  "message": "Aucun compte vendeur trouvé avec cette adresse email. Veuillez vous inscrire d'abord."
}
```

### Email invalide

**Erreur (400) :**
```json
{
  "success": false,
  "message": "L'adresse email n'est pas valide"
}
```

### Code invalide ou expiré

**Erreur (400) :**
```json
{
  "success": false,
  "message": "Code de vérification invalide ou expiré",
  "tentatives_restantes": 2
}
```

## Utilisation du token JWT

Une fois connecté, utilisez le token JWT dans l'en-tête `Authorization` :

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Exemples avec cURL

### 1. Créer un compte

```bash
curl -X POST http://localhost:3000/api/v1/vendeurs \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendeur@example.com",
    "nom": "Jean Dupont",
    "telephone": "+241 01 23 45 67",
    "ville": "Libreville"
  }'
```

### 2. Demander un code

```bash
curl -X POST http://localhost:3000/api/v1/vendeurs/code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendeur@example.com"
  }'
```

### 3. Vérifier le code

```bash
curl -X POST http://localhost:3000/api/v1/vendeurs/verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendeur@example.com",
    "code": "123456"
  }'
```

### 4. Utiliser le token

```bash
curl -X GET http://localhost:3000/api/v1/vendeurs/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Exemples avec JavaScript/Fetch

### 1. Créer un compte

```javascript
const response = await fetch('/api/v1/vendeurs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'vendeur@example.com',
    nom: 'Jean Dupont',
    telephone: '+241 01 23 45 67',
    ville: 'Libreville'
  })
});

const data = await response.json();
console.log(data);
```

### 2. Demander un code

```javascript
const response = await fetch('/api/v1/vendeurs/code', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'vendeur@example.com'
  })
});

const data = await response.json();
console.log(data);
```

### 3. Vérifier le code

```javascript
const response = await fetch('/api/v1/vendeurs/verification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'vendeur@example.com',
    code: '123456'
  })
});

const data = await response.json();

if (data.success) {
  // Stocker le token
  localStorage.setItem('token', data.token);
  console.log('Connexion réussie:', data.vendeur);
}
```

### 4. Utiliser le token

```javascript
const token = localStorage.getItem('token');

const response = await fetch('/api/v1/vendeurs/1', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(data);
```

## Sécurité

### Codes de vérification

- **Durée de vie :** 10 minutes
- **Longueur :** 6 chiffres
- **Tentatives :** 3 maximum
- **Régénération :** Possible après expiration

### Tokens JWT

- **Durée de vie :** 7 jours (configurable)
- **Algorithme :** HS256
- **Stockage :** Côté client (localStorage, sessionStorage, ou cookies sécurisés)

### Bonnes pratiques

1. **Ne jamais exposer les tokens** dans les logs ou URLs
2. **Vérifier l'expiration** des tokens côté client
3. **Implémenter un refresh token** pour les sessions longues
4. **Utiliser HTTPS** en production
5. **Valider les emails** côté client avant envoi

## Documentation Swagger

La documentation complète est disponible à l'adresse :
- **Développement :** http://localhost:3000/api/docs
- **Production :** https://votre-domaine.com/api/docs

## Support

En cas de problème :
1. Vérifiez les logs du serveur
2. Consultez la documentation Swagger
3. Testez avec les exemples cURL
4. Vérifiez la configuration email (Gmail SMTP)
