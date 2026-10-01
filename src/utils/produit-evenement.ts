export const MESSAGE_MIX_PANIER =
  'Les billets événement ne peuvent pas être mélangés avec d’autres articles. Videz le panier ou retirez les articles incompatibles.';

export function isProduitEvenement(produit: { variants?: unknown } | null | undefined): boolean {
  const variants = produit?.variants;
  if (!variants || typeof variants !== 'object') {
    return false;
  }
  return (variants as { type?: string }).type === 'evenement';
}

export interface ErreurModificationEvenement {
  field: string;
  code: string;
  message: string;
}

interface BilletEvenement {
  id?: string;
  nom?: string;
  prix?: number;
  prix_promo?: number | null;
  stock?: number;
}

interface VariantsEvenement {
  meta?: Record<string, unknown>;
  variants?: BilletEvenement[];
}

/** Informations de l'événement figées dès la première vente. */
const CHAMPS_META_VERROUILLES: Array<{ cle: string; libelle: string }> = [
  { cle: 'date_debut', libelle: 'La date de début' },
  { cle: 'date_fin', libelle: 'La date de fin' },
  { cle: 'lieu', libelle: 'Le lieu' },
  { cle: 'adresse', libelle: "L'adresse" },
  { cle: 'non_remboursable', libelle: 'La condition de remboursement' }
];

const texte = (valeur: unknown) => (valeur === undefined || valeur === null ? '' : String(valeur).trim());
const montant = (valeur: unknown) => Number(valeur) || 0;

/**
 * Vérifie qu'une mise à jour d'événement respecte les règles de modification :
 * - la catégorie ne change jamais ;
 * - après la première vente, les infos clés et les billets vendus (nom, prix, promo)
 *   sont figés, un billet vendu ne peut pas être supprimé et ses places ne font qu'augmenter.
 * `ventesParType` : nombre de billets émis par `type_billet` (= nom du billet).
 */
export function verifierModificationEvenement(
  existant: { nom: string; categorie_id?: number | null; variants?: unknown },
  modifications: { nom?: string; categorie_id?: number | null; variants?: unknown },
  ventesParType: Record<string, number>
): ErreurModificationEvenement[] {
  const erreurs: ErreurModificationEvenement[] = [];
  const verrou = (field: string, message: string) => erreurs.push({ field, code: 'EVENEMENT_VERROUILLE', message });

  if (
    modifications.categorie_id !== undefined &&
    Number(modifications.categorie_id) !== Number(existant.categorie_id)
  ) {
    verrou('categorie_id', "La catégorie d'un événement ne peut pas être modifiée");
  }

  const totalVendus = Object.values(ventesParType).reduce((somme, n) => somme + n, 0);
  if (totalVendus === 0) {
    return erreurs;
  }

  const suffixe = 'ne peut plus être modifié(e) : des billets ont déjà été vendus';

  if (modifications.nom !== undefined && texte(modifications.nom) !== texte(existant.nom)) {
    verrou('nom', `Le nom de l'événement ${suffixe}`);
  }

  if (modifications.variants === undefined) {
    return erreurs;
  }

  const avant = (existant.variants || {}) as VariantsEvenement;
  const apres = (modifications.variants || {}) as VariantsEvenement;

  // Normalisation alignée sur le formulaire du front : dates au format
  // « AAAA-MM-JJTHH:mm » et billet non remboursable par défaut.
  const normaliserMeta = (cle: string, valeur: unknown) => {
    if (cle === 'non_remboursable') return String(valeur !== false);
    if (cle.startsWith('date_')) return texte(valeur).slice(0, 16);
    return texte(valeur);
  };

  for (const { cle, libelle } of CHAMPS_META_VERROUILLES) {
    if (normaliserMeta(cle, avant.meta?.[cle]) !== normaliserMeta(cle, apres.meta?.[cle])) {
      verrou(`variants.meta.${cle}`, `${libelle} ${suffixe}`);
    }
  }

  const billetsApres = Array.isArray(apres.variants) ? apres.variants : [];
  for (const billet of Array.isArray(avant.variants) ? avant.variants : []) {
    const nouveau = billet.id
      ? billetsApres.find((b) => b.id === billet.id)
      : billetsApres.find((b) => texte(b.nom) === texte(billet.nom));
    const vendus = ventesParType[texte(billet.nom)] || 0;

    if (!nouveau) {
      if (vendus > 0) {
        verrou('variants.variants', `Le billet « ${texte(billet.nom)} » a déjà été vendu et ne peut pas être supprimé`);
      }
      continue;
    }

    if (vendus === 0) {
      continue;
    }

    if (texte(nouveau.nom) !== texte(billet.nom)) {
      verrou('variants.variants.nom', `Le nom du billet « ${texte(billet.nom)} » ${suffixe}`);
    }
    if (montant(nouveau.prix) !== montant(billet.prix) || montant(nouveau.prix_promo) !== montant(billet.prix_promo)) {
      verrou('variants.variants.prix', `Le prix du billet « ${texte(billet.nom)} » ${suffixe}`);
    }
    if (montant(nouveau.stock) < montant(billet.stock)) {
      erreurs.push({
        field: 'variants.variants.stock',
        code: 'PLACES_EN_BAISSE',
        message: `Les places du billet « ${texte(billet.nom)} » ne peuvent qu'augmenter (actuellement ${montant(billet.stock)} restantes)`
      });
    }
  }

  return erreurs;
}

/**
 * Interprète une date d'événement saisie en heure locale du Gabon (UTC+1, sans heure d'été)
 * au format « AAAA-MM-JJTHH:mm[:ss] » ; une date avec fuseau explicite est lue telle quelle.
 */
export function dateEvenementEnMs(valeur: unknown): number | null {
  const texteDate = texte(valeur);
  if (!texteDate) return null;
  const sansFuseau = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(texteDate);
  const ms = Date.parse(sansFuseau ? `${texteDate}+01:00` : texteDate);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Cohérence des dates d'un événement : à la création, le début doit être dans le futur ;
 * la fin, si elle est renseignée, doit toujours être postérieure au début.
 */
export function verifierDatesEvenement(
  variants: unknown,
  { creation }: { creation: boolean }
): ErreurModificationEvenement[] {
  const meta = ((variants || {}) as VariantsEvenement).meta || {};
  const debut = dateEvenementEnMs(meta.date_debut);
  const fin = dateEvenementEnMs(meta.date_fin);
  const erreurs: ErreurModificationEvenement[] = [];

  if (creation && (debut === null || debut <= Date.now())) {
    erreurs.push({
      field: 'variants.meta.date_debut',
      code: 'DATE_PASSEE',
      message: 'La date de début doit être dans le futur'
    });
  }
  if (debut !== null && fin !== null && fin <= debut) {
    erreurs.push({
      field: 'variants.meta.date_fin',
      code: 'DATE_FIN_AVANT_DEBUT',
      message: 'La date de fin doit être postérieure à la date de début'
    });
  }
  return erreurs;
}

/** Statuts qu'un vendeur peut donner lui-même à un événement (publication réservée à l'équipe). */
const STATUTS_EVENEMENT_VENDEUR = ['brouillon', 'en_attente_validation'];

export const MESSAGE_PUBLICATION_RESERVEE_ADMIN =
  'La publication des événements est validée par l’équipe Marché 241. Demandez la publication depuis votre tableau de bord.';

/**
 * Statut à enregistrer à la création d'un événement par un vendeur :
 * brouillon, sauf demande explicite de publication.
 */
export function statutCreationEvenementVendeur(statutDemande: unknown): string {
  return statutDemande === 'en_attente_validation' ? 'en_attente_validation' : 'brouillon';
}

/**
 * Un vendeur ne peut faire passer un événement que de brouillon à « en attente de validation »
 * (et inversement). Renvoyer le statut actuel (sauvegarde d'un événement publié) est accepté.
 */
export function transitionStatutEvenementVendeurAutorisee(statutActuel: string, statutDemande: unknown): boolean {
  if (statutDemande === undefined || statutDemande === statutActuel) {
    return true;
  }
  return (
    STATUTS_EVENEMENT_VENDEUR.includes(statutActuel) &&
    typeof statutDemande === 'string' &&
    STATUTS_EVENEMENT_VENDEUR.includes(statutDemande)
  );
}
