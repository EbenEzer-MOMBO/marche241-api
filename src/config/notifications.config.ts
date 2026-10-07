/**
 * Catalogue des événements notifiés à l'équipe sur Telegram.
 * Tout ajout ici doit être branché dans le code (`notifier('code', …)`) et apparaît automatiquement
 * dans la page Paramètres du back-office.
 */

export const GROUPES_NOTIFICATION = [
  { code: 'boosts', nom: 'Boosts publicitaires' },
  { code: 'publicites', nom: 'Bannières sponsorisées' },
  { code: 'commandes', nom: 'Commandes & paiements' },
  { code: 'versements', nom: 'Versements' },
  { code: 'vendeurs', nom: 'Vendeurs & boutiques' }
] as const;

export type GroupeNotification = (typeof GROUPES_NOTIFICATION)[number]['code'];

export const EVENEMENTS_NOTIFICATION = [
  { code: 'boost_a_valider', groupe: 'boosts', nom: 'Boost payé à valider', emoji: '📣' },
  { code: 'boost_erreur_meta', groupe: 'boosts', nom: 'Erreur de publication Meta', emoji: '⚠️' },
  { code: 'boost_rejete_meta', groupe: 'boosts', nom: 'Publicité rejetée par Meta', emoji: '⛔' },
  { code: 'boost_a_rembourser', groupe: 'boosts', nom: 'Remboursement de boost à faire', emoji: '💸' },
  { code: 'publicite_a_valider', groupe: 'publicites', nom: 'Bannière payée à valider', emoji: '🖼️' },
  { code: 'publicite_a_rembourser', groupe: 'publicites', nom: 'Remboursement de bannière à faire', emoji: '💸' },
  { code: 'publicite_sous_garantie', groupe: 'publicites', nom: 'Bannière sous le seuil d\'affichages garanti', emoji: '📉' },
  { code: 'commande_payee', groupe: 'commandes', nom: 'Nouvelle commande payée', emoji: '🛒' },
  { code: 'paiement_echoue', groupe: 'commandes', nom: 'Paiement échoué', emoji: '❌' },
  { code: 'versement_effectue', groupe: 'versements', nom: 'Versement effectué', emoji: '✅' },
  { code: 'versement_echec', groupe: 'versements', nom: 'Versement en échec', emoji: '🚨' },
  { code: 'vendeur_inscrit', groupe: 'vendeurs', nom: 'Nouveau vendeur inscrit', emoji: '👤' },
  { code: 'boutique_creee', groupe: 'vendeurs', nom: 'Nouvelle boutique créée', emoji: '🏪' },
  { code: 'produit_a_valider', groupe: 'vendeurs', nom: 'Produit en attente de validation', emoji: '📝' }
] as const;

export type EvenementNotification = (typeof EVENEMENTS_NOTIFICATION)[number]['code'];

export const CODES_EVENEMENTS = EVENEMENTS_NOTIFICATION.map((e) => e.code) as string[];

export function evenementParCode(code: string) {
  return EVENEMENTS_NOTIFICATION.find((e) => e.code === code) ?? null;
}
