# Publicité interne — bannières sponsorisées

Deuxième type de pub du module **Publicité** (à côté du boost Meta, `docs/BOOST_META.md`). Plan : `../PLAN_PUB_INTERNE.md`.

## Principe

- Vente **à la semaine calendaire** (lundi 00:00 → dimanche 23:59:59, heure de Libreville, UTC+1), semaines consécutives.
- **Un annonceur par créneau et par semaine**, garanti par l'index unique `uq_publicite_reservation_creneau` de `publicite_reservations`.
- Annonceurs **vendeurs** (dashboard, paiement eBilling à l'acte, validation par l'équipe) ou **externes** (créés par l'équipe, payés hors plateforme ou offerts, validés d'office).
- Lien de destination : vendeur → **sa boutique ou un de ses produits** (construit par l'API, avec UTM `utm_source=marche241&utm_medium=banniere&utm_campaign=pub_<id>`) ; externe → URL `https` libre.

## Formules et créneaux

| Formule | Prix / semaine (défaut) | Créneaux réservés | Où |
|---|---|---|---|
| Catégorie | 1 500 FCFA | `categorie` (+ `categorie_id`) | en-tête de `/produits?categorie=<slug>` |
| Accueil | 3 000 FCFA | `accueil` | accueil, sous le hero |
| Premium | 6 000 FCFA | `accueil` + `pages` | accueil + bandeau sur les autres pages publiques + 1 publication réseaux |

Accueil et Premium se bloquent mutuellement sur une même semaine. Une page catégorie affiche au plus 2 bannières (catégorie + Premium). Les vitrines `/[boutique]` et le dashboard vendeur n'affichent **jamais** de bannière.

Remise **4 semaines = prix de 3** par tranche complète de 4 semaines. Frais d'encaissement eBilling (2,5 % par défaut) inclus dans le total et non remboursables.

## Cycle de vie

```
brouillon → en_attente_paiement → en_attente_validation → programmee → active → terminee
                 │ (paiement non abouti après delai_paiement_minutes : retour brouillon, semaines libérées)
                 └→ brouillon                       ├→ refusee (semaines libérées, remboursement hors frais)
                                                    programmee/active → annulee (semaines futures libérées, remboursement au prorata)
terminee → programmee/active : uniquement via « offrir une semaine » (garantie d'affichages)
```

- Les semaines sont réservées **à la soumission** et tenues pendant le paiement.
- Paiement tardif après libération : l'API tente de re-réserver ; si les semaines sont prises → montant à rembourser.
- Paiement en double → montant ajouté au remboursement (`statut_remboursement = a_rembourser`), traité manuellement dans le back-office.
- Cron `statuts-publicites` (toutes les heures, minute 5) + `GET /cron/publicites/statuts` : démarrage, fin (bilan, alerte « sous garantie »), libération des paiements expirés. La diffusion publique se fie aux dates, pas au cron.

## Mesure

- **Affichage** : `POST /publicites/:id/affichage { page }`, envoyé par le front quand la bannière est visible à ≥ 50 % pendant 1 s, une fois par chargement.
- **Clic** : `GET /publicites/:id/clic?page=` → enregistre puis **302** vers `url_destination` enregistrée (aucune URL n'est lue dans la requête : pas de redirection ouverte).
- Non comptés : robots, back-office, vendeur annonceur, IP privées/locales, rafales (même empreinte d'IP < 60 s). L'IP n'est jamais stockée : empreinte SHA-256 salée (`ip_hash`).
- Interactions conservées 180 jours (nettoyées avec les vues, cron mensuel).

## Routes (`/api/v1/publicites`)

| Accès | Méthode et chemin |
|---|---|
| Public | `GET /diffusion?page=accueil\|produits\|categorie\|evenements\|boutiques\|autre&categorie_id=` · `POST /:id/affichage` · `GET /:id/clic` |
| Vendeur (JWT) | `GET /parametres?boutique_id=` · `GET /disponibilites?formule=&categorie_id=` · `POST /devis` · `GET /boutique/:boutiqueId` · `POST /` · `GET\|PUT\|DELETE /:id` · `POST /:id/soumettre` · `POST /:id/annuler-soumission` · `POST /:id/paiement` |
| Back-office (`x-service-key`) | `GET\|POST /admin` · `GET /admin/stats` · `GET /admin/planning` · `GET\|PUT /admin/parametres` · `POST /admin/rafraichir` · `GET /admin/:id` · `GET /admin/:id/bilan` · `POST /admin/:id/approuver\|refuser\|annuler\|offrir-semaine\|rembourse\|reseaux-fait` |

`GET /boosts/parametres` renvoie `types.plateforme = plateforme_active && !kill_switch` (carte « Mise en avant sur Marché 241 » du wizard).

## Paramètres (`publicite_parametres`)

`tarifs`, `remise_4_pour_3`, `semaines_max`, `semaines_avance_max`, `garantie_affichages` (seuil par semaine et par formule), `eligibilite` (`verifiees` | `toutes`), `frais_encaissement_bps`, `delai_paiement_minutes`, `plateforme_active` (ouverture aux vendeurs), `kill_switch` (coupe diffusion et réservations).

## Notifications Telegram

`publicite_a_valider`, `publicite_a_rembourser`, `publicite_sous_garantie` (groupe « Bannières sponsorisées »). Le vendeur reçoit des notifications push (validation, refus, début de diffusion, bilan, semaine offerte, annulation).

## Visuels

Desktop **1200 × 300** (obligatoire), mobile **800 × 400** (facultatif) ; JPG, PNG ou WebP ; upload via `POST /upload/image`.
