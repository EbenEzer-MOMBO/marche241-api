# Erreurs de validation (HTTP 400)

Les routes Express protégées par le middleware `validate`, `validateParams` ou `validateQuery` ([`src/middlewares/validation.middleware.ts`](../src/middlewares/validation.middleware.ts)) valident les données avec **Joi**. En cas d’échec, le gestionnaire global d’erreurs renvoie une réponse JSON structurée plutôt qu’un simple message générique.

## Quand cette réponse s’applique

- **Corps de requête** : schéma Joi ne correspond pas (ex. création ou mise à jour de produit).
- **Paramètres d’URL** : `:id`, `:slug`, etc. invalides après validation.
- **Query string** : pagination ou filtres invalides.

Les erreurs **métier** renvoyées en 400 par un contrôleur (sans passer par Joi) peuvent avoir une autre forme ; seules les erreurs du middleware de validation suivent le contrat ci-dessous.

## Structure de la réponse

| Champ | Type | Description |
|--------|------|-------------|
| `success` | `boolean` | Toujours `false`. |
| `code` | `string` | `VALIDATION_ERROR` lorsque des erreurs de validation sont présentes. |
| `message` | `string` | Résumé lisible : une erreur détaillée (`Validation impossible : champ — …`) ou plusieurs champs (troncature si le texte dépasse environ 800 caractères). |
| `errors` | `array` | Liste d’objets décrivant chaque problème (voir ci-dessous). |
| `stack` | `string` | Uniquement en **development** (`NODE_ENV=development`). |

### Objet dans `errors[]`

| Champ | Type | Description |
|--------|------|-------------|
| `field` | `string` | Nom du champ ou chemin (notation point si imbriqué). |
| `code` | `string` | Code stable pour le client, dérivé du type Joi (ex. `STRING_MAX_LENGTH`, `FIELD_REQUIRED`, `NUMBER_MIN`). |
| `message` | `string` | Message en français, parfois enrichi (longueur actuelle / maximum, valeur reçue / borne). |
| `meta` | `object` | Optionnel. Champs utiles selon la règle : `limit`, `length`, `value`, `allowed`, etc. |

## Exemple (description trop longue)

**Requête** : `POST /api/v1/produits` avec un champ `description` de plus de 1000 caractères.

**Réponse** (corps approximatif) :

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation impossible : description — La description ne doit pas dépasser 1000 caractères (longueur actuelle : 1523, maximum : 1000).",
  "errors": [
    {
      "field": "description",
      "code": "STRING_MAX_LENGTH",
      "message": "La description ne doit pas dépasser 1000 caractères (longueur actuelle : 1523, maximum : 1000).",
      "meta": {
        "limit": 1000,
        "length": 1523
      }
    }
  ]
}
```

## Intégration côté client

1. Vérifier `response.code === 'VALIDATION_ERROR'` ou la présence de `errors`.
2. Afficher `message` pour un retour utilisateur rapide.
3. Pour des formulaires champ par champ, utiliser `errors[].field` et `errors[].message` (et éventuellement `errors[].code` / `meta` pour des cas particuliers).

## Référence OpenAPI

Les schémas `ValidationErrorResponse` et `ValidationErrorItem` sont déclarés pour Swagger dans [`src/utils/swagger-schemas.validation.ts`](../src/utils/swagger-schemas.validation.ts) et apparaissent sous **Schemas** dans la documentation interactive (`/api/docs`).
