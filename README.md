# Marche241 API

API backend pour la plateforme Marche241 - marketplace gabonaise.

## 🚀 Configuration

### Prérequis
- Node.js (version 16 ou supérieure)
- npm ou yarn
- Compte Supabase

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

### Configuration Supabase

Pour configurer Supabase, vous devez :

1. **Créer un projet Supabase** sur [supabase.com](https://supabase.com)

2. **Récupérer vos clés API** :
   - Allez dans `Settings > API`
   - Copiez l'URL du projet
   - Copiez la clé `anon public`
   - Copiez la clé `service_role` (gardez-la secrète !)

3. **Configurer la base de données** :
   - Allez dans `Settings > Database`
   - Copiez l'URL de connexion PostgreSQL

4. **Mettre à jour le fichier .env** :
```env
SUPABASE_URL=https://votre-projet-ref.supabase.co
SUPABASE_ANON_KEY=votre-cle-anon
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
DATABASE_URL=postgresql://postgres:[VOTRE-MOT-DE-PASSE]@db.votre-projet-ref.supabase.co:5432/postgres
```

### Variables d'environnement importantes

| Variable | Description | Obligatoire |
|----------|-------------|--------------|
| `SUPABASE_URL` | URL de votre projet Supabase | ✅ |
| `SUPABASE_ANON_KEY` | Clé publique Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service Supabase | ✅ |
| `DATABASE_URL` | URL de connexion PostgreSQL | ✅ |
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
- ✅ Ne partagez jamais vos clés de service Supabase
- ✅ Configurez CORS appropriément
- ✅ Implémentez le rate limiting

## 🛠️ Technologies utilisées

- **Runtime** : Node.js
- **Base de données** : Supabase (PostgreSQL)
- **Authentification** : JWT + Supabase Auth
- **ORM** : Supabase Client
- **Sécurité** : bcrypt, CORS, rate limiting

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