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

export const LONGUEUR_MAX_CHAMP_PARTICIPANT = 200;
export const CHAMPS_PARTICIPANT = ['nom_complet', 'telephone', 'profession', 'email'] as const;
export type ChampParticipant = (typeof CHAMPS_PARTICIPANT)[number];

export interface InfosParticipantsConfig {
  actif: boolean;
  champs: ChampParticipant[];
}

export function estChampParticipant(valeur: unknown): valeur is ChampParticipant {
  return typeof valeur === 'string' && (CHAMPS_PARTICIPANT as readonly string[]).includes(valeur);
}

export function normaliserInfosParticipants(valeur: unknown): InfosParticipantsConfig {
  if (!valeur || typeof valeur !== 'object') {
    return { actif: false, champs: [] };
  }
  const brut = valeur as { actif?: unknown; champs?: unknown };
  const champs = Array.isArray(brut.champs)
    ? (brut.champs.filter(estChampParticipant) as ChampParticipant[])
    : [];
  const actif = brut.actif === true;
  if (!actif) {
    return { actif: false, champs: [] };
  }
  const unique = [...new Set(champs)];
  if (!unique.includes('nom_complet')) {
    unique.unshift('nom_complet');
  }
  return { actif, champs: unique };
}

export function signatureInfosParticipants(valeur: unknown): string {
  const n = normaliserInfosParticipants(valeur);
  return JSON.stringify({ actif: n.actif, champs: [...n.champs].sort() });
}

export type ParticipantSaisie = Partial<Record<ChampParticipant, string>>;

export function extraireParticipantsDepuisArticle(article: {
  participants?: unknown;
  variants_selectionnes?: { participants?: unknown };
}): unknown {
  if (article.participants !== undefined) {
    return article.participants;
  }
  return article.variants_selectionnes?.participants;
}

export function validerEtNormaliserParticipants(
  produit: { nom?: string; variants?: unknown },
  quantite: number,
  participants: unknown
): { ok: true; participants: ParticipantSaisie[] } | { ok: false; erreurs: ErreurModificationEvenement[] } {
  const config = normaliserInfosParticipants(
    ((produit.variants || {}) as VariantsEvenement).meta?.infos_participants
  );
  if (!config.actif) {
    return { ok: true, participants: [] };
  }

  const nomProduit = produit.nom || 'événement';
  if (!Array.isArray(participants) || participants.length !== quantite) {
    return {
      ok: false,
      erreurs: [{
        field: 'articles.participants',
        code: 'PARTICIPANTS_REQUIS',
        message: `Renseignez les informations de chaque participant pour « ${nomProduit} » (${quantite} billet${quantite > 1 ? 's' : ''})`
      }]
    };
  }

  const erreurs: ErreurModificationEvenement[] = [];
  const normalises: ParticipantSaisie[] = [];

  participants.forEach((entree, index) => {
    const fiche: ParticipantSaisie = {};
    const source = entree && typeof entree === 'object' ? (entree as Record<string, unknown>) : {};
    for (const champ of config.champs) {
      const valeur = texte(source[champ]);
      if (!valeur) {
        erreurs.push({
          field: `articles.participants.${index}.${champ}`,
          code: 'PARTICIPANT_CHAMP_REQUIS',
          message: `Le champ « ${champ} » est requis pour le billet ${index + 1} de « ${nomProduit} »`
        });
        continue;
      }
      if (valeur.length > LONGUEUR_MAX_CHAMP_PARTICIPANT) {
        erreurs.push({
          field: `articles.participants.${index}.${champ}`,
          code: 'PARTICIPANT_CHAMP_TROP_LONG',
          message: `Le champ « ${champ} » du billet ${index + 1} de « ${nomProduit} » est trop long`
        });
        continue;
      }
      if (champ === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)) {
        erreurs.push({
          field: `articles.participants.${index}.email`,
          code: 'PARTICIPANT_EMAIL_INVALIDE',
          message: `L'adresse email du billet ${index + 1} de « ${nomProduit} » n'est pas valide`
        });
        continue;
      }
      fiche[champ] = valeur;
    }
    normalises.push(fiche);
  });

  if (erreurs.length > 0) {
    return { ok: false, erreurs };
  }
  return { ok: true, participants: normalises };
}

export function verifierInfosParticipantsConfig(variants: unknown): ErreurModificationEvenement[] {
  const meta = ((variants || {}) as VariantsEvenement).meta || {};
  if (meta.infos_participants === undefined) {
    return [];
  }
  const raw = meta.infos_participants;
  if (typeof raw !== 'object' || raw === null) {
    return [{
      field: 'variants.meta.infos_participants',
      code: 'INFOS_PARTICIPANTS_INVALIDE',
      message: 'La configuration des informations participants est invalide'
    }];
  }
  const champs = (raw as { champs?: unknown }).champs;
  if (champs !== undefined && !Array.isArray(champs)) {
    return [{
      field: 'variants.meta.infos_participants.champs',
      code: 'INFOS_PARTICIPANTS_INVALIDE',
      message: 'Les champs participants doivent être une liste'
    }];
  }
  if (Array.isArray(champs) && champs.some((c) => !estChampParticipant(c))) {
    return [{
      field: 'variants.meta.infos_participants.champs',
      code: 'INFOS_PARTICIPANTS_INVALIDE',
      message: 'Champ participant inconnu'
    }];
  }
  const config = normaliserInfosParticipants(raw);
  if (config.actif && !config.champs.includes('nom_complet')) {
    return [{
      field: 'variants.meta.infos_participants.champs',
      code: 'INFOS_PARTICIPANTS_NOM_REQUIS',
      message: 'Le nom complet est obligatoire pour les billets nommés'
    }];
  }
  return [];
}

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

  if (signatureInfosParticipants(avant.meta?.infos_participants) !== signatureInfosParticipants(apres.meta?.infos_participants)) {
    verrou('variants.meta.infos_participants', `Les informations demandées aux participants ${suffixe}`);
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
