# API de Tracking des Vues - Boutiques et Produits

## Description

Le système de tracking des vues permet de comptabiliser les visites uniques sur les boutiques et les produits. Une vue est considérée comme unique par combinaison **IP + entité + jour** (une même IP ne peut générer qu'une seule vue par jour pour une même boutique ou un même produit).

---

## Endpoints

### 1. Produits les plus vus d'une Boutique

```
GET /api/v1/boutiques/:id/produits/top-vues
```

#### Description
Récupère les produits avec le plus grand nombre de vues pour une boutique donnée.

#### Authentification
🔓 **Publique** - Pas d'authentification requise

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID de la boutique |

#### Paramètres Query

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `limite` | integer | 5 | Nombre de produits à retourner (1-20) |

#### Exemple de requête

```bash
curl -X GET "https://api.marche241.com/api/v1/boutiques/57/produits/top-vues?limite=5"
```

#### Réponse succès (200)

```json
{
  "success": true,
  "boutique_id": 57,
  "nom_boutique": "Ma Super Boutique",
  "limite": 5,
  "produits": [
    {
      "id": 123,
      "nom": "iPhone 15 Pro",
      "slug": "iphone-15-pro",
      "prix": 850000,
      "prix_promo": 750000,
      "nombre_vues": 350,
      "image_principale": "https://example.com/iphone.jpg",
      "categorie": {
        "id": 2,
        "nom": "Téléphones",
        "slug": "telephones"
      }
    },
    {
      "id": 456,
      "nom": "Samsung Galaxy S24",
      "slug": "samsung-galaxy-s24",
      "prix": 650000,
      "nombre_vues": 280,
      "image_principale": "https://example.com/samsung.jpg",
      "categorie": {
        "id": 2,
        "nom": "Téléphones",
        "slug": "telephones"
      }
    }
  ]
}
```

#### Erreurs possibles

| Code | Message | Description |
|------|---------|-------------|
| 400 | ID de boutique invalide | L'ID fourni n'est pas un nombre valide |
| 404 | Boutique non trouvée | Aucune boutique avec cet ID |

---

### 2. Statistiques de vues d'une Boutique

```
GET /api/v1/boutiques/:id/stats
```

> 🔒 Authentification requise

#### Description
Récupère les statistiques détaillées des vues d'une boutique.

#### Authentification
🔒 **Requise** - Token JWT (propriétaire de la boutique)

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID de la boutique |

#### Exemple de requête

```bash
curl -X GET "https://api.marche241.com/api/v1/boutiques/57/stats" \
  -H "Authorization: Bearer <votre_token_jwt>"
```

#### Réponse succès (200)

```json
{
  "success": true,
  "boutique_id": 57,
  "nom_boutique": "Ma Super Boutique",
  "statistiques": {
    "nombre_vues_total": 1250,
    "vues_totales": 1250,
    "vues_aujourd_hui": 45,
    "vues_7_jours": 320,
    "vues_30_jours": 890
  }
}
```

#### Champs de la réponse

| Champ | Type | Description |
|-------|------|-------------|
| `nombre_vues_total` | integer | Compteur total stocké dans la table boutiques |
| `vues_totales` | integer | Nombre total de vues dans la table de tracking |
| `vues_aujourd_hui` | integer | Vues enregistrées aujourd'hui |
| `vues_7_jours` | integer | Vues des 7 derniers jours |
| `vues_30_jours` | integer | Vues des 30 derniers jours |

#### Erreurs possibles

| Code | Message | Description |
|------|---------|-------------|
| 400 | ID de boutique invalide | L'ID fourni n'est pas un nombre valide |
| 401 | Non authentifié | Token JWT manquant ou invalide |
| 403 | Non autorisé | L'utilisateur n'est pas propriétaire de la boutique |
| 404 | Boutique non trouvée | Aucune boutique avec cet ID |

---

### 3. Statistiques de vues d'un Produit

```
GET /api/v1/produits/:id/stats
```

> 🔒 Authentification requise

#### Description
Récupère les statistiques détaillées des vues d'un produit.

#### Authentification
🔒 **Requise** - Token JWT

#### Paramètres URL

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID du produit |

#### Exemple de requête

```bash
curl -X GET "https://api.marche241.com/api/v1/produits/123/stats" \
  -H "Authorization: Bearer <votre_token_jwt>"
```

#### Réponse succès (200)

```json
{
  "success": true,
  "produit_id": 123,
  "nom_produit": "iPhone 15 Pro",
  "statistiques": {
    "nombre_vues_total": 350,
    "vues_totales": 350,
    "vues_aujourd_hui": 12,
    "vues_7_jours": 85,
    "vues_30_jours": 220
  }
}
```

#### Champs de la réponse

| Champ | Type | Description |
|-------|------|-------------|
| `nombre_vues_total` | integer | Compteur total stocké dans la table produits |
| `vues_totales` | integer | Nombre total de vues dans la table de tracking |
| `vues_aujourd_hui` | integer | Vues enregistrées aujourd'hui |
| `vues_7_jours` | integer | Vues des 7 derniers jours |
| `vues_30_jours` | integer | Vues des 30 derniers jours |

#### Erreurs possibles

| Code | Message | Description |
|------|---------|-------------|
| 400 | ID de produit invalide | L'ID fourni n'est pas un nombre valide |
| 401 | Non authentifié | Token JWT manquant ou invalide |
| 404 | Produit non trouvé | Aucun produit avec cet ID |

---

## Tracking automatique des vues

Les vues sont enregistrées **automatiquement** lorsqu'un utilisateur consulte une boutique ou un produit via les endpoints suivants :

### Boutiques
- `GET /api/v1/boutiques/:id` - Consultation par ID ou slug
- `GET /api/v1/boutiques/slug/:slug` - Consultation par slug

### Produits
- `GET /api/v1/produits/:id` - Consultation par ID ou slug
- `GET /api/v1/produits/slug/:slug` - Consultation par slug

### Données collectées

| Donnée | Description |
|--------|-------------|
| `ip_address` | Adresse IP du visiteur (IPv4 ou IPv6) |
| `user_agent` | Navigateur/appareil du visiteur |
| `referer` | Page de provenance |
| `date_vue` | Date et heure de la visite |

---

## Règles de déduplication

Pour éviter les faux comptages :

1. **Une seule vue par IP par jour** : Si la même IP consulte la même boutique/produit plusieurs fois dans la journée, seule la première visite est comptée.

2. **Basé sur l'IP réelle** : Le système utilise le header `X-Forwarded-For` pour obtenir l'IP réelle derrière un proxy/load balancer.

3. **IPs privées ignorées** : Les IPs locales (127.0.0.1, 192.168.x.x, etc.) ne sont pas comptabilisées.

---

## Schéma de la base de données

### Table `vues_tracking`

```sql
CREATE TABLE vues_tracking (
    id SERIAL PRIMARY KEY,
    type_entite type_entite_vue NOT NULL,  -- 'boutique' ou 'produit'
    entite_id INTEGER NOT NULL,             -- ID de la boutique ou du produit
    ip_address VARCHAR(45) NOT NULL,        -- Adresse IP (IPv4/IPv6)
    user_agent TEXT,                        -- User-Agent du navigateur
    referer TEXT,                           -- Page de provenance
    date_vue TIMESTAMP WITH TIME ZONE,      -- Date et heure de la vue
    date_vue_jour DATE                      -- Date du jour (pour unicité)
);
```

### Colonnes ajoutées

- `boutiques.nombre_vues` : Compteur total de vues de la boutique
- `produits.nombre_vues` : Compteur total de vues du produit

---

## Exemples d'utilisation

### Dashboard vendeur - Afficher les stats d'une boutique

```javascript
async function getStatsVuesBoutique(boutiqueId, token) {
  const response = await fetch(`/api/v1/boutiques/${boutiqueId}/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log(`Vues aujourd'hui: ${data.statistiques.vues_aujourd_hui}`);
    console.log(`Vues cette semaine: ${data.statistiques.vues_7_jours}`);
    console.log(`Vues ce mois: ${data.statistiques.vues_30_jours}`);
    console.log(`Total: ${data.statistiques.nombre_vues_total}`);
  }
}
```

### Afficher les stats d'un produit populaire

```javascript
async function getStatsProduit(produitId, token) {
  const response = await fetch(`/api/v1/produits/${produitId}/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    return {
      nom: data.nom_produit,
      vuesTotal: data.statistiques.nombre_vues_total,
      vuesJour: data.statistiques.vues_aujourd_hui,
      vuesSemaine: data.statistiques.vues_7_jours
    };
  }
}
```

---

## Notes techniques

- Les vues sont enregistrées de manière **asynchrone** (ne bloquent pas la réponse API)
- Les données de tracking sont conservées **90 jours** par défaut
- Une fonction SQL `nettoyer_anciennes_vues()` permet de purger les anciennes données
