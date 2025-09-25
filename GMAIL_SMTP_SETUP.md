# Configuration Gmail SMTP - Marché 241 API

## Vue d'ensemble

Ce guide vous explique comment configurer Gmail SMTP pour l'envoi d'emails dans l'API Marché 241.

## Étapes de configuration

### 1. Activer l'authentification à 2 facteurs sur Gmail

1. Allez sur [myaccount.google.com](https://myaccount.google.com)
2. Cliquez sur "Sécurité" dans le menu de gauche
3. Activez "Validation en 2 étapes"

### 2. Générer un mot de passe d'application

1. Toujours dans "Sécurité", cherchez "Mots de passe des applications"
2. Cliquez sur "Mots de passe des applications"
3. Sélectionnez "Autre (nom personnalisé)"
4. Tapez "Marché 241 API" comme nom
5. Cliquez sur "Générer"
6. **Copiez le mot de passe généré** (16 caractères sans espaces)

### 3. Configurer les variables d'environnement

Dans votre fichier `.env`, ajoutez :

```bash
# Configuration Gmail SMTP
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=votre-email@gmail.com
MAIL_PASSWORD=votre-mot-de-passe-application
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=votre-email@gmail.com
MAIL_FROM_NAME="Marché 241"
```

**Important :** 
- `MAIL_USERNAME` = votre adresse Gmail complète
- `MAIL_PASSWORD` = le mot de passe d'application généré (pas votre mot de passe Gmail)
- `MAIL_FROM_ADDRESS` = généralement la même que `MAIL_USERNAME`

### 4. Exemple de configuration complète

```bash
# Configuration Gmail SMTP
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=ebenezermombo@gmail.com
MAIL_PASSWORD=abcd efgh ijkl mnop
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=ebenezermombo@gmail.com
MAIL_FROM_NAME="Marché 241"
```

## Test de la configuration

Une fois configuré, redémarrez votre serveur :

```bash
npm run dev
```

Vous devriez voir dans les logs :
```
✅ Service email Gmail SMTP configuré
✅ Connexion Gmail SMTP vérifiée avec succès
```

## Dépannage

### Erreur "Invalid login"
- Vérifiez que l'authentification à 2 facteurs est activée
- Vérifiez que vous utilisez le mot de passe d'application (pas votre mot de passe Gmail)
- Vérifiez que l'adresse email est correcte

### Erreur "Connection timeout"
- Vérifiez votre connexion internet
- Vérifiez que le port 587 n'est pas bloqué par votre firewall

### Erreur "Authentication failed"
- Régénérez un nouveau mot de passe d'application
- Vérifiez que l'authentification à 2 facteurs est bien activée

## Sécurité

⚠️ **Important :**
- Ne partagez jamais votre mot de passe d'application
- Ajoutez `.env` à votre `.gitignore` pour éviter de commiter vos credentials
- Utilisez des variables d'environnement différentes pour la production

## Limites Gmail

Gmail SMTP a des limites :
- **500 emails par jour** pour les comptes gratuits
- **100 destinataires par email**
- **500 emails par heure**

Pour une utilisation en production intensive, considérez :
- Gmail Workspace (limites plus élevées)
- Services dédiés comme SendGrid, Mailgun, ou Resend

## Migration vers Resend (optionnel)

Une fois que vous voulez passer à Resend :

1. Obtenez une clé API sur [resend.com](https://resend.com)
2. Modifiez le service email pour utiliser Resend
3. Mettez à jour vos variables d'environnement

## Support

En cas de problème :
1. Vérifiez les logs du serveur
2. Testez avec un email simple d'abord
3. Vérifiez la configuration Gmail dans les paramètres Google
