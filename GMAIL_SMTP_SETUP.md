# Configuration Resend - Marché 241 API

## Vue d'ensemble

Les emails transactionnels de l'API Marché 241 (codes de vérification, bienvenue,
changements de statut de boutique) sont envoyés via l'API HTTP de
[Resend](https://resend.com) (`POST https://api.resend.com/emails`), et non via SMTP.
Render restreint les connexions SMTP sortantes, ce qui rendait l'ancienne
configuration Gmail SMTP peu fiable en production.

## Étapes de configuration

### 1. Obtenir une clé API Resend

1. Créez un compte sur [resend.com](https://resend.com)
2. Ajoutez et vérifiez votre domaine d'envoi (SPF/DKIM/DMARC générés par Resend)
3. Générez une clé API dans **API Keys**

### 2. Configurer les variables d'environnement

Dans votre fichier `.env` :

```bash
RESEND_API_KEY=re_votre_cle_api
MAIL_FROM_ADDRESS="noreply@marche241.ga"
MAIL_FROM_NAME="Marché241"
```

`MAIL_FROM_ADDRESS` doit appartenir au domaine vérifié dans Resend.

Les images des emails (logo) doivent être hébergées sur ce même domaine ou un
sous-domaine (`https://marche241.ga/images/site-logo-mail.png`). Resend signale
comme suspectes les URLs hors domaine d'envoi (ex. Render). Surcharge possible
via `MAIL_ASSETS_URL`.

### 3. Test de la configuration

Redémarrez le serveur (`npm run dev`). Sans `RESEND_API_KEY`, le service passe en
mode simulation (les emails sont uniquement logués, aucun envoi réel) — pratique en
développement local. Avec la clé renseignée, chaque envoi est logué avec l'id
Resend retourné.

## Dépannage

- **401 Unauthorized** : clé API invalide ou révoquée.
- **403 Forbidden / domaine non vérifié** : `MAIL_FROM_ADDRESS` n'appartient pas à un
  domaine vérifié dans le dashboard Resend.
- **422 Unprocessable Entity** : adresse destinataire invalide.

## Sécurité

⚠️ Ne commitez jamais `RESEND_API_KEY`. Utilisez des clés distinctes pour le
développement et la production.
