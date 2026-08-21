# Marche241 API

API backend pour la plateforme Marche241 - marketplace gabonaise.

## 🚀 Configuration

### Prérequis
- Node.js (version 22 ou supérieure)
- npm ou yarn
- Base PostgreSQL Neon
- Bucket Cloudflare R2 (uploads)

### Installation

1. Clonez le repository
```bash
git clone <repository-url>
cd marche241-api
```

2. Installez les dépendances
```bash
npm install
```

3. Configuration de l'environnement
```bash
cp .env.example .env
```

4. Configurez vos variables d'environnement dans le fichier `.env`

### Configuration Neon et R2

1. **Base de données** : utilisez la chaîne de connexion poolée Neon (`-pooler` dans l'hôte).
2. **Stockage** : renseignez les variables `STORAGE_*` du bucket Cloudflare R2.
3. **Mettre à jour le fichier .env** (voir `.env.example`) :
```env
DATABASE_URL=postgresql://<user>:<password>@ep-xxxx-pooler.<region>.aws.neon.tech/<db>?sslmode=require
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=your-r2-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-r2-secret-access-key
STORAGE_BUCKET=marche241-uploads
STORAGE_PUBLIC_URL=https://cdn.example.com
```

### Variables d'environnement importantes

| Variable | Description | Obligatoire |
|----------|-------------|--------------|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL Neon (poolée) | ✅ |
| `STORAGE_ENDPOINT` | Endpoint S3 du compte R2 | ✅ |
| `STORAGE_ACCESS_KEY_ID` | Identifiant du token R2 | ✅ |
| `STORAGE_SECRET_ACCESS_KEY` | Secret du token R2 | ✅ |
| `STORAGE_BUCKET` | Nom du bucket R2 | ✅ |
| `STORAGE_PUBLIC_URL` | URL publique du bucket | ✅ |
| `JWT_SECRET` | Secret pour signer les tokens JWT | ✅ |
| `PORT` | Port d'écoute du serveur | ❌ (défaut: 3000) |
| `NODE_ENV` | Environnement d'exécution | ❌ (défaut: development) |

## 🏃‍♂️ Démarrage

### Mode développement
```bash
npm run dev
```

### Mode production
```bash
npm start
```

## 📁 Structure du projet

```
marche241-api/
├── app.js              # Point d'entrée de l'application
├── package.json        # Dépendances et scripts
├── .env                # Variables d'environnement (non versionné)
├── .env.example        # Template des variables d'environnement
├── .gitignore          # Fichiers à ignorer par Git
└── README.md           # Documentation du projet
```

## 🔐 Sécurité

- ✅ Le fichier `.env` est dans `.gitignore`
- ✅ Utilisez des mots de passe forts
- ✅ Ne partagez jamais `DATABASE_URL`, `JWT_SECRET` ni les clés R2
- ✅ Configurez CORS appropriément
- ✅ Implémentez le rate limiting

## 🛠️ Technologies utilisées

- **Runtime** : Node.js
- **Base de données** : Neon (PostgreSQL) via `pg`
- **Stockage** : Cloudflare R2
- **Authentification** : JWT
- **Sécurité** : CORS, rate limiting

## 📝 API Documentation

Documentation interactive (Swagger UI) :

```
http://localhost:3000/api/docs
```

Spécification OpenAPI JSON : `GET /api/docs.json`

### Erreurs de validation (HTTP 400)

Les échecs de validation Joi (corps, paramètres d’URL ou query) renvoient un objet avec `code: "VALIDATION_ERROR"`, un `message` explicite et un tableau `errors` détaillé par champ. Voir [docs/ERREURS_VALIDATION.md](docs/ERREURS_VALIDATION.md).

## 🤝 Contribution

1. Fork le projet
2. Créez une branche pour votre feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

---

**Marche241** - Connecter le Gabon, un produit à la fois 🇬🇦