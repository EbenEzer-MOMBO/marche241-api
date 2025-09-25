# Authentification par Email - Marché 241 API

## Vue d'ensemble

L'authentification des vendeurs a été modifiée pour utiliser l'email au lieu du numéro de téléphone. Les codes de vérification sont maintenant envoyés par email via Gmail SMTP.

## Changements apportés

### 1. Configuration

Ajout des variables d'environnement dans `.env` :
```bash
# Configuration Gmail SMTP pour l'envoi d'emails
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=votre-email@gmail.com
MAIL_PASSWORD=votre-mot-de-passe-application
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=votre-email@gmail.com
MAIL_FROM_NAME="Marché 241"
```

**Note :** Voir le fichier `GMAIL_SMTP_SETUP.md` pour les instructions détaillées de configuration Gmail.

### 2. Service Email

Nouveau service `EmailService` créé dans `src/services/email.service.ts` :
- Envoi de codes de vérification par email
- Templates HTML personnalisés
- Email de bienvenue pour les nouveaux vendeurs

### 3. Modèle VendeurModel

Nouvelles méthodes ajoutées :
- `getVendeurByEmail(email: string)` : Récupère un vendeur par email
- `generateVerificationCodeByEmail(email: string)` : Génère un code à 6 chiffres
- `verifyCodeByEmail(email: string, code: string)` : Vérifie le code par email

### 4. Contrôleur VendeurController

Fonctions modifiées :
- `demanderCodeVerification` : Utilise maintenant l'email
- `verifierCode` : Vérifie le code via l'email

### 5. Types et Interfaces

Interfaces modifiées dans `src/lib/database-types.ts` :
```typescript
export interface DemandeCodeVerification {
  email: string; // Changé de 'telephone' à 'email'
}

export interface VerificationCode {
  email: string; // Changé de 'telephone' à 'email'
  code: string;
}
```

### 6. Schémas de Validation

Schémas mis à jour dans `src/utils/validation.schemas.ts` :
- `demandeCodeSchema` : Valide l'email au lieu du téléphone
- `verificationCodeSchema` : Code à 6 chiffres au lieu de 4

## Utilisation

### 1. Demander un code de vérification

**Endpoint :** `POST /api/v1/vendeurs/code`

**Body :**
```json
{
  "email": "vendeur@example.com"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Code de vérification envoyé par email avec succès",
  "code": "123456" // Uniquement en développement
}
```

### 2. Vérifier le code

**Endpoint :** `POST /api/v1/vendeurs/verification`

**Body :**
```json
{
  "email": "vendeur@example.com",
  "code": "123456"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Code de vérification valide - Connexion réussie",
  "vendeur": {
    "id": 1,
    "email": "vendeur@example.com",
    "nom": "Vendeur Example",
    "statut": "actif",
    // ... autres champs
  },
  "token": "jwt-token-here"
}
```

## Fonctionnalités

### Templates Email

1. **Code de vérification** : Email avec design professionnel contenant le code à 6 chiffres
2. **Email de bienvenue** : Envoyé automatiquement lors de la première vérification

### Sécurité

- Codes à 6 chiffres (plus sécurisés que 4 chiffres)
- Expiration des codes après 10 minutes
- Limitation des tentatives (3 maximum)
- Validation stricte des emails

### Gestion d'erreurs

- Gestion gracieuse des erreurs d'envoi d'email
- Logs détaillés pour le débogage
- Messages d'erreur explicites pour l'utilisateur

## Installation

1. Installer le package Nodemailer :
```bash
npm install nodemailer @types/nodemailer
```

2. Configurer Gmail SMTP (voir `GMAIL_SMTP_SETUP.md` pour les détails)

3. Configurer les variables d'environnement dans `.env`

## Migration

Pour migrer depuis l'ancien système basé sur le téléphone :

1. Les anciennes méthodes sont conservées pour la compatibilité
2. Les nouveaux vendeurs utilisent automatiquement l'email
3. Les vendeurs existants peuvent être migrés progressivement

## Tests

En mode développement (`NODE_ENV=development`), le code de vérification est retourné dans la réponse API pour faciliter les tests.

En production, seul le message de succès est retourné, et le code doit être récupéré depuis l'email.
