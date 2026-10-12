import { TAUX_MARGE_DEFAUT } from './marge';

export interface RequeteInsertionCommande {
  text: string;
  params: unknown[];
}

/**
 * Requête d'insertion d'une commande : le taux de marge n'est jamais fourni par le client,
 * il est copié depuis le vendeur de la boutique (10 si la boutique est introuvable) et figé
 * sur la commande (cf. migration 037). Les colonnes et placeholders viennent de la liste
 * blanche du modèle ; l'identifiant de boutique est ajouté en dernier paramètre.
 */
export const construireInsertionCommande = (
  colonnes: string[],
  placeholders: string[],
  valeurs: unknown[],
  boutiqueId: number
): RequeteInsertionCommande => {
  const parametreBoutique = valeurs.length + 1;

  return {
    text: `INSERT INTO commandes (${colonnes.join(', ')}, taux_marge, date_commande, date_modification)
         VALUES (
           ${placeholders.join(', ')},
           COALESCE(
             (SELECT v.taux_marge FROM boutiques b JOIN vendeurs v ON v.id = b.vendeur_id
              WHERE b.id = $${parametreBoutique}),
             ${TAUX_MARGE_DEFAUT}
           ),
           NOW(), NOW()
         )
         RETURNING *`,
    params: [...valeurs, boutiqueId]
  };
};
