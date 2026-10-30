import { BoutiqueModel } from '../models/boutique.model';
import { ProduitModel } from '../models/produit.model';
import {
  BoostEvenementModel,
  BoostInsightModel,
  BoostModel,
  BoostParametresModel,
  BoostTransactionModel,
  DonneesBoost
} from '../models/boost.model';
import { Boost, BoostEvenement, BoostParametres, CiblageBoost, ObjectifBoost, TypeCibleBoost } from '../lib/database-types';
import { budgetJourMinimum, budgetParJour, devisDepuisTotal, estTotalDansBornes, formaterFcfa, totalMinimumPourMedia } from '../lib/boost/devis';
import { notifier } from './telegram.service';
import { EvenementNotification } from '../config/notifications.config';
import { bilanProvisoire, calculerCloture, DELAI_BILAN_MS, fraisEncaissement, montantApresBilan, remboursementIntegral } from '../lib/boost/reliquat';
import { ajouterUtmBoost, estDestinationMarche241 } from '../lib/boost/utm';
import { expliquerRemboursement } from '../lib/boost/remboursement';
import { ajouterLienBoutique, lienBoutiquePublic } from '../lib/boost/texte';
import { dateIso } from '../lib/boost/planning';
import {
  cheminVideoDepuisUrl,
  DELAI_BROUILLON_VIDEO_JOURS,
  DELAI_VIDEO_BOOST_TERMINE_JOURS,
  DUREE_MAX_VIDEO_BOOST_SEC,
  estUrlVideoBoutique
} from '../config/boost-video.config';
import { estConformiteComplete } from '../config/conformite-boost.config';
import { isEvenementTermine } from '../utils/produit-evenement';
import {
  activerPublication,
  changerStatutCampagne,
  depenseVersFcfa,
  deviseCompte,
  exigerConnexionPrete,
  lireInsights,
  lireStatutPublicite,
  normaliserStatutEffectif,
  objectifMeta,
  publierBoost,
  televerserVideo,
  attendreVideoPrete
} from './meta-ads.service';
import { MetaGraphError } from '../lib/meta/graph';
import {
  chargerMetaConfig,
  decouvrir,
  estModeSimule,
  MetaConnexionErreur,
  pagePublicationDepuisDecouverte,
  PagePublication,
  verifierSiNecessaire
} from './meta-connexion.service';
import { PaiementController } from '../controllers/paiement.controller';
import { logger } from '../utils/logger';
import { EmailService, LIBELLES_MOYEN_VERSEMENT } from './email.service';
import { WhatsAppService } from './whatsapp.service';
import { VendeurModel } from '../models/vendeur.model';
import { buildBoostEnLigneComponents, TEMPLATE_BOOST_EN_LIGNE } from './whatsapp-templates-boost';

/**
 * Orchestration métier du boost publicitaire Meta (port du cycle de boost_meta, adapté au paiement à l'acte).
 * Cycle : brouillon → en_attente_paiement → en_attente_validation → actif ⇄ en_pause → termine
 * (sorties : refuse, rejete_meta, erreur). Cf. docs/BOOST_META.md.
 */

/**
 * Page de la boutique si elle est liée, sinon la page Marché 241.
 * En mode simulé, aucun appel Meta : on reprend les noms déjà en base.
 */
async function pagePourPublication(pageBoutiqueId: string | null, pageBoutiqueNom: string | null): Promise<PagePublication> {
  const config = await chargerMetaConfig();
  if (estModeSimule()) {
    if (pageBoutiqueId) {
      return { pageId: pageBoutiqueId, pageNom: pageBoutiqueNom ?? pageBoutiqueId, instagramId: null, instagramNom: null };
    }
    return {
      pageId: config.pageId,
      pageNom: config.connexion?.page_nom ?? (config.pageId ? 'Page Marché 241' : ''),
      instagramId: config.instagramId || null,
      instagramNom: config.connexion?.instagram_nom ?? null
    };
  }
  const decouverte = await decouvrir();
  return pagePublicationDepuisDecouverte(decouverte.pages, pageBoutiqueId, config.pageId);
}

export class BoostErreur extends Error {
  constructor(message: string, public readonly statusHttp = 400, public readonly code = 'BOOST_ERREUR') {
    super(message);
    this.name = 'BoostErreur';
  }
}

const introuvable = () => new BoostErreur('Boost introuvable', 404, 'BOOST_INTROUVABLE');

const LIBELLES_OBJECTIF: Record<string, string> = { trafic: 'Visites', whatsapp: 'Messages WhatsApp', notoriete: 'Visibilité' };

/** Statuts atteints seulement après qu'un paiement a déjà été pris en compte. */
const STATUTS_APRES_PAIEMENT = new Set(['en_attente_validation', 'refuse', 'actif', 'en_pause', 'termine', 'rejete_meta', 'erreur']);

/** Notification Telegram de l'équipe sur un boost (sans attente : n'interrompt jamais le flux). */
function notifierBoost(evenement: EvenementNotification, boost: Boost, titre: string, lignes: Array<string | null> = []): void {
  void (async () => {
    const boutique = await BoutiqueModel.getBoutiqueById(boost.boutique_id).catch(() => null);
    await notifier(evenement, {
      titre,
      lignes: [`Boutique : ${boutique?.nom ?? `#${boost.boutique_id}`}`, `Boost #${boost.id} · ${boost.titre || boost.nom}`, ...lignes],
      lien: `/boosts/${boost.id}`
    });
  })().catch(() => undefined);
}

const frontendUrl = () => (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');

/** Événements du journal visibles par le vendeur (les autres restent internes). */
const EVENEMENTS_VENDEUR = new Set([
  'creation',
  'soumission',
  'paiement_confirme',
  'paiement_en_double',
  'paiement_hors_file',
  'publie',
  'en_ligne',
  'refuse',
  'rejete_meta',
  'pause',
  'reprise',
  'termine',
  'rembourse'
]);

export interface DonneesBrouillon {
  type_cible?: TypeCibleBoost;
  produit_id?: number | null;
  objectif?: ObjectifBoost;
  nom?: string;
  total_fcfa?: number;
  duree_jours?: number;
  ciblage?: Partial<CiblageBoost>;
  url_destination?: string | null;
  whatsapp_e164?: string | null;
  titre?: string | null;
  texte_principal?: string | null;
  description?: string | null;
  image_url?: string | null;
  media_type?: 'image' | 'video';
  video_url?: string | null;
  video_duree_sec?: number | null;
}

/**
 * Message d'erreur si le budget média par jour est sous le plancher (null sinon).
 * Quand le plancher Meta dépasse le minimum général, indique le montant minimum pour la durée choisie
 * (et, pour WhatsApp, l'alternative « Visites »).
 */
export function messageBudgetInsuffisant(
  totalFcfa: number,
  dureeJours: number,
  objectif: ObjectifBoost | null | undefined,
  parametres: BoostParametres,
  fraisVideoFcfa = 0
): string | null {
  const devis = devisDepuisTotal(totalFcfa, parametres.commission_bps, parametres.commission_min_fcfa, parametres.tva_bps, fraisVideoFcfa);
  const parJour = budgetParJour(devis.budget_media_fcfa, dureeJours);
  const minimum = budgetJourMinimum(parametres);
  if (parJour >= minimum) return null;
  if (minimum > parametres.budget_jour_min_fcfa) {
    const totalMin = totalMinimumPourMedia(minimum * dureeJours, parametres.commission_bps, parametres.commission_min_fcfa, parametres.tva_bps, fraisVideoFcfa);
    const debut = objectif === 'whatsapp' ? 'Pour recevoir des messages WhatsApp, Meta demande' : 'Meta demande';
    const alternative = objectif === 'whatsapp' ? " ou choisissez l'objectif « Visites »" : '';
    return `${debut} au moins ${formaterFcfa(minimum)} de publicité par jour : il faut au moins ${formaterFcfa(totalMin)} pour ${dureeJours} jours. Augmentez le montant, réduisez la durée${alternative}`;
  }
  const avecVideo = fraisVideoFcfa > 0 ? ` (dont ${formaterFcfa(fraisVideoFcfa)} de frais vidéo)` : '';
  return `Budget publicitaire trop faible pour ${dureeJours} jours (${formaterFcfa(parJour)} par jour, minimum ${formaterFcfa(minimum)})${avecVideo} : augmentez le montant ou réduisez la durée`;
}

/** Frais fixe applicable à un boost : seulement pour une créa vidéo. */
export function fraisVideoPour(mediaType: string | null | undefined, parametres: Pick<BoostParametres, 'frais_video_fcfa'>): number {
  return mediaType === 'video' ? Math.max(0, parametres.frais_video_fcfa) : 0;
}

/**
 * Faut-il prévenir de la mise en ligne ? Uniquement au passage vers ACTIVE (pas si Meta l'était déjà
 * lors d'une synchro précédente, ex. boosts diffusés avant ce déploiement) et jamais en mode simulé.
 */
export function doitNotifierMiseEnLigne(
  ancienStatutMeta: string | null | undefined,
  nouveauStatutMeta: string,
  dryRun: boolean,
  dateValidation: Date | string | null = null,
  maintenant = Date.now()
): boolean {
  if (dryRun || normaliserStatutEffectif(nouveauStatutMeta) !== 'actif') return false;
  if (ancienStatutMeta) return normaliserStatutEffectif(ancienStatutMeta) !== 'actif';
  // Statut jamais lu : on ne prévient que pour une pub validée il y a moins de 24 h (pas de notification
  // tardive pour un boost en ligne depuis des jours dont la lecture du statut échouait)
  return Boolean(dateValidation) && maintenant - new Date(dateValidation as string).getTime() < 24 * 60 * 60 * 1000;
}

type CanalNotification = 'ok' | 'simule' | 'echec' | 'sans_destinataire';

/** Transfert mobile money fait par l'admin (SHAP / eBilling), repris dans l'e-mail au vendeur. */
export interface TransfertRemboursement {
  moyen: 'airtel_money' | 'moov_money';
  telephone: string;
  reference: string;
}

/** Montant encore dû au vendeur (0 si le dernier montant a déjà été remboursé). */
const resteDu = (boost: Pick<Boost, 'statut_remboursement' | 'montant_a_rembourser_fcfa'>) =>
  boost.statut_remboursement === 'a_rembourser' ? boost.montant_a_rembourser_fcfa : 0;

const dateCourte = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Libreville', day: 'numeric', month: 'long' }) : '-';

/** Date de fin de diffusion dépassée (le boost doit être clôturé sans attendre la synchro horaire). */
export function estEchu(boost: Pick<Boost, 'date_fin'>, maintenant = Date.now()): boolean {
  return Boolean(boost.date_fin) && new Date(boost.date_fin as unknown as string).getTime() <= maintenant;
}

/** Âge maximal des statistiques affichées avant un rafraîchissement à la demande (15 min). */
const DELAI_FRAICHEUR_MS = 15 * 60 * 1000;

export interface DemandePaiement {
  mode: 'mobile' | 'carte';
  operateur?: 'airtelmoney' | 'moovmoney';
  msisdn?: string;
  return_url?: string;
  email?: string | null;
  nom?: string | null;
}

/**
 * Nom et prénom du payeur pour eBilling, qui refuse une facture sans `payer_first_name` (HTTP 400).
 * « Eben Ezer Mombo » → prénom « Eben », nom « Ezer Mombo » ; un seul mot sert aux deux.
 */
export function nomPayeur(nomComplet: string | null | undefined): { prenom: string; nom: string } {
  const mots = (nomComplet ?? '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return { prenom: 'Vendeur', nom: 'Marché 241' };
  return { prenom: mots[0], nom: mots.length > 1 ? mots.slice(1).join(' ') : mots[0] };
}

function ciblageComplet(partiel: Partial<CiblageBoost> | undefined, existant?: CiblageBoost): CiblageBoost {
  const base: CiblageBoost = existant ?? { pays: ['GA'], villes: [], age_min: 18, age_max: 65, sexes: [], langues: [], interets: [] };
  return { ...base, ...(partiel ?? {}) } as CiblageBoost;
}

export async function preparerVideoPourPublication(
  boost: Pick<Boost, 'id' | 'media_type' | 'video_url' | 'meta_video_id'>,
  deps: {
    televerser?: typeof televerserVideo;
    attendre?: typeof attendreVideoPrete;
    sauverId?: (boostId: number, videoId: string) => Promise<void>;
    effacerId?: (boostId: number) => Promise<void>;
  } = {}
): Promise<string | null> {
  if ((boost.media_type ?? 'image') !== 'video') return null;
  const televerser = deps.televerser ?? televerserVideo;
  const attendre = deps.attendre ?? attendreVideoPrete;
  const sauverId =
    deps.sauverId ??
    (async (boostId: number, videoId: string) => {
      await BoostModel.mettreAJour(boostId, { meta_video_id: videoId });
    });
  const effacerId =
    deps.effacerId ??
    (async (boostId: number) => {
      await BoostModel.mettreAJour(boostId, { meta_video_id: null });
    });
  let videoId = boost.meta_video_id;
  if (!videoId) {
    if (!boost.video_url) throw new BoostErreur('Une vidéo est requise', 400, 'VALIDATION_ERROR');
    videoId = await televerser(boost.video_url, `M241 · boost_${boost.id}`);
    await sauverId(boost.id, videoId);
  }
  const etat = await attendre(videoId);
  if (etat === 'processing') {
    throw new BoostErreur(
      'La vidéo est encore en traitement chez Meta. Réessayez dans quelques secondes.',
      409,
      'VIDEO_EN_TRAITEMENT'
    );
  }
  if (etat === 'error') {
    // Sans cela, chaque relance relirait la même vidéo en échec : l'identifiant est effacé pour que
    // la prochaine tentative renvoie le fichier à Meta.
    await effacerId(boost.id);
    throw new MetaGraphError('Meta a rejeté le traitement de la vidéo', 'advideos');
  }
  return videoId;
}

type SupprimerFichier = (chemin: string) => Promise<{ success: boolean; error?: string }>;

const supprimerFichierR2: SupprimerFichier = async (chemin) => (await import('../utils/storage.utils')).deleteFile(chemin);

/**
 * Supprime une vidéo de boost de R2 (au mieux : un échec est journalisé, jamais bloquant). Ne touche que
 * `boosts/{slug}/*.mp4|mov` sous STORAGE_PUBLIC_URL. Renvoie true si un fichier a été supprimé.
 */
export async function supprimerVideoR2(videoUrl: string | null | undefined, supprimer: SupprimerFichier = supprimerFichierR2): Promise<boolean> {
  const chemin = cheminVideoDepuisUrl(videoUrl);
  if (!chemin) return false;
  try {
    const resultat = await supprimer(chemin);
    if (!resultat.success) logger.warn(`[BoostService] Suppression R2 de ${chemin} impossible : ${resultat.error ?? 'raison inconnue'}`);
    return resultat.success;
  } catch (err: any) {
    logger.warn(`[BoostService] Suppression R2 de ${chemin} impossible : ${err?.message}`);
    return false;
  }
}

export class BoostService {
  static async parametres(): Promise<BoostParametres> {
    return BoostParametresModel.lire();
  }

  /** Données de pré-remplissage du wizard à partir de la boutique ou d'un produit. */
  static async prefill(boutiqueId: number, produitId?: number | null): Promise<DonneesBrouillon & { type_cible: TypeCibleBoost }> {
    const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);
    if (!boutique) throw new BoostErreur('Boutique introuvable', 404, 'BOUTIQUE_INTROUVABLE');
    const whatsapp = boutique.telephone ? `+${boutique.telephone.replace(/\D/g, '').replace(/^00/, '')}` : null;

    if (produitId) {
      const produit = await ProduitModel.getProduitById(produitId);
      if (!produit || produit.boutique_id !== boutiqueId) throw new BoostErreur('Produit introuvable', 404, 'PRODUIT_INTROUVABLE');
      if (isEvenementTermine(produit)) throw new BoostErreur('Cet événement est terminé : il ne peut plus être boosté', 400, 'EVENEMENT_TERMINE');
      const images = Array.isArray(produit.images) ? (produit.images as string[]) : [];
      return {
        type_cible: 'produit',
        produit_id: produit.id,
        nom: `Boost — ${produit.nom}`.slice(0, 120),
        titre: produit.nom.slice(0, 80),
        texte_principal: (produit.description_courte || produit.description || `Découvrez ${produit.nom} sur ${boutique.nom}.`).slice(0, 500),
        image_url: produit.image_principale || images[0] || boutique.banniere || boutique.logo || null,
        url_destination: `${frontendUrl()}/${boutique.slug}/produit/${produit.id}`,
        whatsapp_e164: whatsapp
      };
    }

    return {
      type_cible: 'boutique',
      produit_id: null,
      nom: `Boost — ${boutique.nom}`.slice(0, 120),
      titre: boutique.nom.slice(0, 80),
      texte_principal: (boutique.description || `Découvrez la boutique ${boutique.nom} sur Marché 241.`).slice(0, 500),
      image_url: boutique.banniere || boutique.logo || null,
      url_destination: `${frontendUrl()}/${boutique.slug}`,
      whatsapp_e164: whatsapp
    };
  }

  static async creerBrouillon(boutiqueId: number, vendeurId: number, donnees: DonneesBrouillon): Promise<Boost> {
    const parametres = await BoostParametresModel.lire();
    const premierPack = parametres.packs[0];
    const boost = await BoostModel.creer({
      boutique_id: boutiqueId,
      vendeur_id: vendeurId,
      nom: (donnees.nom || donnees.titre || 'Brouillon').trim().slice(0, 120) || 'Brouillon',
      type_cible: donnees.type_cible ?? 'boutique',
      produit_id: donnees.produit_id ?? null,
      objectif: donnees.objectif ?? 'trafic',
      total_fcfa: donnees.total_fcfa ?? premierPack?.total_fcfa ?? parametres.total_min_fcfa,
      duree_jours: donnees.duree_jours ?? premierPack?.duree_jours ?? 7,
      ciblage: ciblageComplet(donnees.ciblage),
      url_destination: donnees.url_destination ?? null,
      whatsapp_e164: donnees.whatsapp_e164 ?? null,
      titre: donnees.titre ?? null,
      texte_principal: donnees.texte_principal ?? null,
      description: donnees.description ?? null,
      image_url: donnees.image_url ?? null,
      media_type: donnees.media_type ?? 'image',
      video_url: donnees.video_url ?? null,
      video_duree_sec: donnees.video_duree_sec ?? null
    });
    await BoostEvenementModel.creer(boost.id, 'creation', 'vendeur');
    return boost;
  }

  static async modifierBrouillon(boost: Boost, donnees: DonneesBrouillon): Promise<Boost> {
    if (boost.statut !== 'brouillon') throw new BoostErreur('Seul un brouillon peut être modifié', 409, 'BOOST_NON_MODIFIABLE');
    const maj: DonneesBoost = { ...donnees, ciblage: donnees.ciblage ? ciblageComplet(donnees.ciblage, boost.ciblage) : undefined };
    if (donnees.nom !== undefined) maj.nom = (donnees.nom || boost.nom).trim().slice(0, 120);
    const resultat = await BoostModel.mettreAJour(boost.id, maj);
    if (!resultat) throw introuvable();
    // Vidéo remplacée ou retirée : l'ancien fichier n'est plus référencé par personne
    if (boost.video_url && maj.video_url !== undefined && maj.video_url !== boost.video_url) {
      await supprimerVideoR2(boost.video_url);
    }
    return resultat;
  }

  static async supprimerBrouillon(boost: Boost): Promise<void> {
    if (!(await BoostModel.supprimerBrouillon(boost.id))) {
      throw new BoostErreur('Seul un brouillon peut être supprimé', 409, 'BOOST_NON_MODIFIABLE');
    }
    await supprimerVideoR2(boost.video_url);
  }

  /**
   * Purge les vidéos qui ne servent plus : brouillons abandonnés (7 jours) et boosts refusés, rejetés ou
   * terminés (30 jours). Le fichier R2 est supprimé puis la référence effacée ; les boosts en cours ou à
   * valider ne sont jamais touchés.
   */
  static async nettoyerVideos(supprimer: SupprimerFichier = supprimerFichierR2): Promise<{ examinees: number; supprimees: number; erreurs: number }> {
    const aPurger = await BoostModel.listerVideosAPurger(DELAI_BROUILLON_VIDEO_JOURS, DELAI_VIDEO_BOOST_TERMINE_JOURS);
    let supprimees = 0;
    let erreurs = 0;
    for (const boost of aPurger) {
      const chemin = cheminVideoDepuisUrl(boost.video_url);
      if (chemin && !(await supprimerVideoR2(boost.video_url, supprimer))) {
        erreurs += 1;
        continue;
      }
      await BoostModel.mettreAJour(boost.id, { video_url: null, video_duree_sec: null });
      supprimees += 1;
    }
    return { examinees: aPurger.length, supprimees, erreurs };
  }

  /** Liste les champs manquants ou invalides avant soumission (vide = soumettable). */
  static validerPourSoumission(boost: Boost, parametres: BoostParametres): Array<{ field: string; message: string }> {
    const erreurs: Array<{ field: string; message: string }> = [];
    if (!boost.titre || boost.titre.trim().length < 3) erreurs.push({ field: 'titre', message: 'Le titre doit contenir au moins 3 caractères' });
    if (!boost.texte_principal || boost.texte_principal.trim().length < 5) erreurs.push({ field: 'texte_principal', message: 'Le texte doit contenir au moins 5 caractères' });
    if (!boost.image_url) {
      erreurs.push({
        field: 'image_url',
        message: (boost.media_type ?? 'image') === 'video' ? 'Une miniature de la vidéo est requise' : 'Un visuel est requis'
      });
    }
    if ((boost.media_type ?? 'image') === 'video') {
      if (!boost.video_url) erreurs.push({ field: 'video_url', message: 'Une vidéo est requise' });
      if (!boost.video_duree_sec || boost.video_duree_sec < 1 || boost.video_duree_sec > DUREE_MAX_VIDEO_BOOST_SEC) {
        erreurs.push({ field: 'video_duree_sec', message: `La vidéo doit durer entre 1 et ${DUREE_MAX_VIDEO_BOOST_SEC} secondes` });
      }
    }
    if (boost.type_cible === 'produit' && !boost.produit_id) erreurs.push({ field: 'produit_id', message: 'Choisissez le produit à promouvoir' });
    if (boost.objectif === 'whatsapp') {
      if (!boost.whatsapp_e164 || !/^\+[1-9]\d{7,14}$/.test(boost.whatsapp_e164)) {
        erreurs.push({ field: 'whatsapp_e164', message: 'Numéro WhatsApp au format international requis (ex. +241…)' });
      }
    } else if (!boost.url_destination) {
      erreurs.push({ field: 'url_destination', message: 'Lien de destination requis' });
    }
    if (!estTotalDansBornes(boost.total_fcfa, parametres.total_min_fcfa, parametres.total_max_fcfa)) {
      erreurs.push({ field: 'total_fcfa', message: `Le montant doit être compris entre ${formaterFcfa(parametres.total_min_fcfa)} et ${formaterFcfa(parametres.total_max_fcfa)}` });
    }
    if (boost.duree_jours < parametres.duree_min_jours || boost.duree_jours > parametres.duree_max_jours) {
      erreurs.push({ field: 'duree_jours', message: `La durée doit être comprise entre ${parametres.duree_min_jours} et ${parametres.duree_max_jours} jours` });
    }
    if (!erreurs.some((e) => e.field === 'total_fcfa' || e.field === 'duree_jours')) {
      try {
        const message = messageBudgetInsuffisant(boost.total_fcfa, boost.duree_jours, boost.objectif, parametres, fraisVideoPour(boost.media_type, parametres));
        // Plancher Meta : c'est le montant qu'il faut augmenter (la durée est souvent déjà au minimum)
        if (message) erreurs.push({ field: budgetJourMinimum(parametres) > parametres.budget_jour_min_fcfa ? 'total_fcfa' : 'duree_jours', message });
      } catch (err: any) {
        erreurs.push({ field: 'total_fcfa', message: err.message });
      }
    }
    const age = boost.ciblage;
    if (age && age.age_min > age.age_max) erreurs.push({ field: 'ciblage.age_min', message: "L'âge minimum doit être inférieur à l'âge maximum" });
    return erreurs;
  }

  /** Fige le devis et passe le boost en attente de paiement. */
  static async soumettre(boost: Boost): Promise<Boost> {
    if (boost.statut === 'en_attente_paiement') return boost;
    if (boost.statut !== 'brouillon') throw new BoostErreur('Ce boost a déjà été soumis', 409, 'BOOST_NON_MODIFIABLE');
    const parametres = await BoostParametresModel.lire();
    const erreurs = BoostService.validerPourSoumission(boost, parametres);
    if ((boost.media_type ?? 'image') === 'video' && boost.video_url) {
      const boutique = await BoutiqueModel.getBoutiqueById(boost.boutique_id);
      if (!boutique || !estUrlVideoBoutique(boost.video_url, boutique.slug)) {
        erreurs.push({ field: 'video_url', message: 'La vidéo doit être dans le dossier de votre boutique' });
      }
    }
    if (erreurs.length) {
      const err = new BoostErreur('Le boost est incomplet', 400, 'VALIDATION_ERROR') as BoostErreur & { errors?: unknown };
      err.errors = erreurs.map((e) => ({ ...e, code: 'BOOST_CHAMP_INVALIDE' }));
      throw err;
    }
    const devis = devisDepuisTotal(boost.total_fcfa, parametres.commission_bps, parametres.commission_min_fcfa, parametres.tva_bps, fraisVideoPour(boost.media_type, parametres));
    const url =
      boost.objectif !== 'whatsapp' && boost.url_destination && estDestinationMarche241(boost.url_destination, process.env.FRONTEND_URL)
        ? ajouterUtmBoost(boost.url_destination, boost.id)
        : boost.url_destination;
    const resultat = await BoostModel.changerStatut(boost.id, ['brouillon'], 'en_attente_paiement', {
      budget_media_fcfa: devis.budget_media_fcfa,
      commission_bps: devis.commission_bps,
      commission_fcfa: devis.commission_fcfa,
      frais_video_fcfa: devis.frais_video_fcfa,
      tva_fcfa: devis.tva_fcfa,
      total_fcfa: devis.total_fcfa,
      frais_encaissement_fcfa: fraisEncaissement(devis.total_fcfa, parametres.frais_encaissement_bps),
      url_destination: url,
      cta: objectifMeta(boost.objectif).cta,
      date_soumission: new Date()
    });
    if (!resultat) throw new BoostErreur('Ce boost a déjà été soumis', 409, 'BOOST_NON_MODIFIABLE');
    await BoostEvenementModel.creer(boost.id, 'soumission', 'vendeur', { devis });
    return resultat;
  }

  /** Revient en brouillon (modification) tant qu'aucun paiement n'est confirmé. */
  static async annulerSoumission(boost: Boost): Promise<Boost> {
    if (boost.statut !== 'en_attente_paiement') throw new BoostErreur("Ce boost n'est pas en attente de paiement", 409, 'BOOST_NON_MODIFIABLE');
    if ((await BoostTransactionModel.compterPayees(boost.id)) > 0) {
      throw new BoostErreur('Un paiement a déjà été confirmé pour ce boost', 409, 'BOOST_DEJA_PAYE');
    }
    const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_paiement'], 'brouillon', { date_soumission: null });
    if (!resultat) throw new BoostErreur('Statut modifié entre-temps, rechargez la page', 409, 'BOOST_NON_MODIFIABLE');
    await BoostEvenementModel.creer(boost.id, 'retour_brouillon', 'vendeur');
    return resultat;
  }

  /**
   * Initie le paiement eBilling du boost. Le montant est celui figé côté serveur (jamais celui du client).
   * Le front vérifie ensuite via GET /paiements/verification/:bill_id (flux existant), dont la
   * confirmation appelle `confirmerPaiement`.
   */
  static async initierPaiement(boost: Boost, demande: DemandePaiement): Promise<{ bill_id: string; url?: string; transaction_id: number }> {
    if (boost.statut !== 'en_attente_paiement') {
      throw new BoostErreur("Ce boost n'est pas en attente de paiement", 409, 'BOOST_NON_PAYABLE');
    }
    // Boost soumis avant l'introduction du plancher Meta : on bloque le paiement plutôt que de
    // laisser Meta refuser la publication après encaissement.
    let insuffisant: string | null;
    try {
      insuffisant = messageBudgetInsuffisant(boost.total_fcfa, boost.duree_jours, boost.objectif, await BoostParametresModel.lire(), boost.frais_video_fcfa ?? 0);
    } catch (err: any) {
      // Paramètres modifiés depuis la soumission (ex. commission minimum relevée au-dessus du total)
      insuffisant = err?.message ?? 'Montant devenu insuffisant';
    }
    if (insuffisant) {
      throw new BoostErreur(`${insuffisant}. Revenez au brouillon pour modifier votre publicité.`, 409, 'BOOST_BUDGET_INSUFFISANT');
    }
    const reference = `BOOST-${boost.id}-${Date.now()}`;
    const description = `Boost publicitaire ${boost.nom}`.slice(0, 100);
    const accessToken = await PaiementController.getAccessToken();
    const payeur = nomPayeur(demande.nom);
    const facture = await PaiementController.creerFacture(
      {
        email: demande.email || 'contact@marche241.ga',
        msisdn: demande.msisdn || '00000000000',
        amount: boost.total_fcfa,
        reference,
        description,
        lastname: payeur.nom,
        firstname: payeur.prenom
      },
      accessToken
    );
    const billId: string | undefined = facture?.response?.e_bills?.[0]?.bill_id;
    if (!billId) throw new BoostErreur('Erreur lors de la création de la facture', 502, 'EBILLING_ERREUR');

    const transaction = await BoostTransactionModel.creer(boost.id, {
      reference_transaction: reference,
      montant: boost.total_fcfa,
      methode_paiement: demande.mode === 'carte' ? 'carte_bancaire' : demande.operateur === 'moovmoney' ? 'moov_money' : 'airtel_money',
      numero_telephone: demande.msisdn ?? null,
      reference_operateur: billId,
      description
    });

    if (demande.mode === 'carte') {
      if (!demande.return_url) throw new BoostErreur('URL de retour requise pour le paiement par carte');
      await BoostEvenementModel.creer(boost.id, 'paiement_initie', 'vendeur', { bill_id: billId, mode: 'carte' });
      return { bill_id: billId, url: PaiementController.urlRedirectionCarte(billId, demande.return_url), transaction_id: transaction.id };
    }

    await PaiementController.envoyerUSSDPush(
      { bill_id: billId, payment_system_name: demande.operateur === 'moovmoney' ? 'moovmoney1' : 'airtelmoney', payer_msisdn: demande.msisdn },
      accessToken
    );
    await BoostEvenementModel.creer(boost.id, 'paiement_initie', 'vendeur', { bill_id: billId, mode: 'mobile', operateur: demande.operateur });
    return { bill_id: billId, transaction_id: transaction.id };
  }

  /**
   * Appelé par la vérification eBilling quand une transaction de boost est payée. Idempotent ;
   * un second paiement confirmé pour le même boost est signalé et ajouté au montant à rembourser.
   */
  static async confirmerPaiement(boostId: number, transactionId: number, montant: number): Promise<void> {
    if (await BoostEvenementModel.paiementDejaTraite(boostId, transactionId)) return;

    const boost = await BoostModel.changerStatut(boostId, ['en_attente_paiement'], 'en_attente_validation', { date_paiement: new Date() });
    if (boost) {
      await BoostEvenementModel.creer(boostId, 'paiement_confirme', 'systeme', { transaction_id: transactionId, montant });
      logger.info(`[BoostService] Paiement confirmé pour le boost #${boostId} (transaction ${transactionId})`);
      notifierBoost('boost_a_valider', boost, 'Boost payé à valider', [
        `Payé : ${formaterFcfa(boost.total_fcfa)} · ${boost.duree_jours} jours`,
        `Objectif : ${LIBELLES_OBJECTIF[boost.objectif] ?? boost.objectif}`
      ]);
      return;
    }
    const actuel = await BoostModel.getById(boostId);
    if (!actuel) {
      logger.error(`[BoostService] confirmerPaiement : boost #${boostId} introuvable (transaction ${transactionId})`);
      return;
    }
    // Le premier paiement a déjà fait passer le boost en file (ou plus loin) : un second poll
    // de la même transaction est ignoré. Tout autre paiement confirmé est à rembourser,
    // y compris celui qui arrive après un retour en brouillon.
    const dejaPrisEnCompte = STATUTS_APRES_PAIEMENT.has(actuel.statut) && (await BoostTransactionModel.compterPayees(boostId)) <= 1;
    if (dejaPrisEnCompte) return;

    const horsFile = !STATUTS_APRES_PAIEMENT.has(actuel.statut);
    const type = horsFile ? 'paiement_hors_file' : 'paiement_en_double';
    const note = horsFile
      ? `Paiement confirmé alors que le boost est « ${actuel.statut} » (transaction ${transactionId})`
      : `Paiement en double (transaction ${transactionId})`;
    const credite = await BoostEvenementModel.crediterRemboursementPaiement(
      boostId, transactionId, montant, type, note, actuel.statut
    );
    if (!credite) return;
    logger.warn(`[BoostService] Paiement ${horsFile ? 'hors file' : 'en double'} pour le boost #${boostId} (transaction ${transactionId})`);
    notifierBoost('boost_a_rembourser', actuel, horsFile ? 'Paiement hors file à rembourser' : 'Paiement en double à rembourser', [
      `Montant : ${formaterFcfa(montant)}`,
      horsFile ? `Statut du boost : ${actuel.statut}` : null
    ]);
  }

  /** Validation par l'équipe Marché 241 puis publication sur Meta. */
  static async approuver(boostId: number, conformite: string[], valideur: string): Promise<{ boost: Boost; erreur?: string }> {
    const parametres = await BoostParametresModel.lire();
    if (parametres.kill_switch) throw new BoostErreur('Kill switch actif : publications coupées', 409, 'KILL_SWITCH');
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw introuvable();
    if (!estConformiteComplete(conformite, boost.media_type)) {
      throw new BoostErreur('Checklist de conformité incomplète', 400, 'CONFORMITE_INCOMPLETE');
    }
    if (boost.statut !== 'en_attente_validation' && boost.statut !== 'erreur') {
      throw new BoostErreur("Ce boost n'est pas en attente de validation", 409, 'BOOST_NON_VALIDABLE');
    }
    // Le budget Meta vient du paiement du vendeur, marge déduite : on ne le complète jamais. Sous le
    // plancher Meta, Meta refuserait la publication : on bloque avant tout appel.
    const minimumJour = budgetJourMinimum(parametres);
    const parJour = budgetParJour(boost.budget_media_fcfa, boost.duree_jours);
    if (!boost.meta_campaign_id && parJour < minimumJour) {
      throw new BoostErreur(
        `Budget Meta insuffisant pour cet objectif : ${formaterFcfa(parJour)} par jour, minimum ${formaterFcfa(minimumJour)}. Refusez le boost pour rembourser le vendeur, qui pourra en créer un avec un montant suffisant`,
        409,
        'BOOST_BUDGET_INSUFFISANT'
      );
    }
    // Hors mode simulé, une connexion Meta incomplète bloque l'approbation sans toucher au boost.
    if (!estModeSimule()) {
      try {
        await exigerConnexionPrete();
      } catch (err) {
        if (err instanceof MetaConnexionErreur) throw new BoostErreur(err.message, err.statusHttp, err.code);
        throw err;
      }
    }

    const dejaCree = Boolean(boost.meta_campaign_id && boost.meta_adset_id && boost.meta_ad_id);
    let texte = boost.texte_principal ?? '';
    let page: PagePublication | null = null;
    let slugBoutique = String(boost.boutique_id);
    if (!dejaCree) {
      const boutique = await BoutiqueModel.getBoutiqueById(boost.boutique_id);
      if (!boutique) throw introuvable();
      slugBoutique = boutique.slug;
      // Lien vers la boutique ajouté en fin de texte si le vendeur ne l'a pas déjà mis
      texte = ajouterLienBoutique(texte, lienBoutiquePublic(boutique.slug, boost.url_destination));
      try {
        page = await pagePourPublication(boutique.meta_page_id, boutique.meta_page_nom);
      } catch (err) {
        if (err instanceof MetaConnexionErreur) throw new BoostErreur(err.message, err.statusHttp, err.code);
        throw err;
      }
    }
    const snapshotPage: DonneesBoost = page
      ? {
          meta_page_id: page.pageId || null,
          meta_page_nom: page.pageNom || null,
          meta_instagram_id: page.instagramId,
          meta_instagram_nom: page.instagramNom
        }
      : {};

    try {
      const videoIdPublication = dejaCree ? boost.meta_video_id : await preparerVideoPourPublication(boost);
      const publication = dejaCree
        ? {
            dryRun: boost.dry_run,
            campaignId: boost.meta_campaign_id as string,
            adSetId: boost.meta_adset_id as string,
            adId: boost.meta_ad_id as string,
            dateDebut: boost.date_debut ? new Date(boost.date_debut) : new Date(),
            dateFin: boost.date_fin ? new Date(boost.date_fin) : new Date()
          }
        : await publierBoost({
            nom: `M241 · boost_${boost.id} · ${slugBoutique}`,
            objectif: boost.objectif,
            budgetMediaFcfa: boost.budget_media_fcfa,
            dureeJours: boost.duree_jours,
            ciblage: boost.ciblage,
            urlDestination: boost.url_destination,
            whatsappE164: boost.whatsapp_e164,
            texte,
            titre: boost.titre ?? boost.nom,
            description: boost.description,
            imageUrl: boost.image_url ?? '',
            videoId: videoIdPublication,
            fxXafParUsd: parametres.fx_xaf_par_usd,
            pageId: page?.pageId ?? '',
            instagramId: page?.instagramId ?? null
          });
      const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_validation', 'erreur'], 'actif', {
        meta_campaign_id: publication.campaignId,
        meta_adset_id: publication.adSetId,
        texte_principal: texte || boost.texte_principal,
        meta_ad_id: publication.adId,
        meta_video_id: videoIdPublication ?? boost.meta_video_id,
        meta_derniere_erreur: null,
        dry_run: publication.dryRun,
        date_debut: publication.dateDebut,
        date_fin: publication.dateFin,
        conformite,
        valide_par: valideur,
        date_validation: new Date(),
        ...snapshotPage
      });
      if (!resultat) {
        logger.error(
          `[BoostService] Boost #${boost.id} non verrouillé après création Meta ${publication.campaignId} (laissé en pause)`
        );
        throw new BoostErreur('Statut modifié entre-temps', 409, 'BOOST_NON_VALIDABLE');
      }
      try {
        await activerPublication(publication);
      } catch (activation: any) {
        const message = activation?.message ?? 'Activation Meta impossible';
        logger.error(`[BoostService] Activation Meta du boost #${boost.id} en échec : ${message}`);
        const enErreur = await BoostModel.changerStatut(boost.id, ['actif'], 'erreur', {
          meta_derniere_erreur: message,
          conformite,
          valide_par: valideur
        });
        await BoostEvenementModel.creer(boost.id, 'erreur_publication', 'meta', { message, etape: 'activation' });
        notifierBoost('boost_erreur_meta', boost, 'Activation Meta en échec', [`Erreur : ${message}`]);
        return { boost: enErreur ?? resultat, erreur: message };
      }
      await BoostEvenementModel.creer(boost.id, 'publie', 'admin', {
        valide_par: valideur,
        lien_boutique_ajoute: Boolean(texte) && texte !== (boost.texte_principal ?? ''),
        dry_run: publication.dryRun,
        meta_campaign_id: publication.campaignId,
        meta_page_id: page?.pageId || boost.meta_page_id
      });
      return { boost: resultat };
    } catch (err: any) {
      if (err instanceof BoostErreur) throw err;
      const message = err?.message ?? 'Publication Meta impossible';
      logger.error(`[BoostService] Publication Meta du boost #${boost.id} en échec : ${message}`);
      const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_validation', 'erreur'], 'erreur', {
        meta_derniere_erreur: message,
        conformite,
        valide_par: valideur,
        ...snapshotPage
      });
      await BoostEvenementModel.creer(boost.id, 'erreur_publication', 'meta', { message });
      notifierBoost('boost_erreur_meta', boost, 'Publication Meta en échec', [`Erreur : ${message}`]);
      return { boost: resultat ?? boost, erreur: message };
    }
  }

  static async refuser(boostId: number, note: string, valideur: string): Promise<Boost> {
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw introuvable();
    const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_validation', 'erreur'], 'refuse', {
      note_revue: note,
      valide_par: valideur,
      date_validation: new Date(),
      statut_remboursement: 'a_rembourser',
      montant_a_rembourser_fcfa: resteDu(boost) + remboursementIntegral(boost)
    });
    if (!resultat) throw new BoostErreur("Ce boost n'est pas en attente de validation", 409, 'BOOST_NON_VALIDABLE');
    await BoostEvenementModel.creer(boost.id, 'refuse', 'admin', { note, valide_par: valideur });
    notifierBoost('boost_a_rembourser', resultat, 'Boost refusé : remboursement à faire', [
      `À rembourser : ${formaterFcfa(resultat.montant_a_rembourser_fcfa)}`,
      `Motif : ${note} (${valideur})`
    ]);
    return resultat;
  }

  static async mettreEnPause(boost: Boost, acteur: BoostEvenement['acteur']): Promise<Boost> {
    if (boost.statut !== 'actif' || !boost.meta_campaign_id) throw new BoostErreur("Ce boost n'est pas en diffusion", 409, 'BOOST_NON_DIFFUSE');
    await changerStatutCampagne(boost.meta_campaign_id, 'PAUSED');
    const resultat = await BoostModel.changerStatut(boost.id, ['actif'], 'en_pause');
    if (!resultat) {
      try {
        await changerStatutCampagne(boost.meta_campaign_id, 'ACTIVE');
      } catch (err: any) {
        logger.error(`[BoostService] Reprise Meta après pause non enregistrée du boost #${boost.id} : ${err?.message}`);
      }
      throw new BoostErreur('Statut modifié entre-temps', 409, 'BOOST_NON_DIFFUSE');
    }
    await BoostEvenementModel.creer(boost.id, 'pause', acteur);
    return resultat;
  }

  static async reprendre(boost: Boost, acteur: BoostEvenement['acteur']): Promise<Boost> {
    if (boost.statut !== 'en_pause' || !boost.meta_campaign_id) throw new BoostErreur("Ce boost n'est pas en pause", 409, 'BOOST_NON_DIFFUSE');
    if (boost.date_fin && new Date(boost.date_fin).getTime() <= Date.now()) {
      throw new BoostErreur('La période de diffusion est terminée', 409, 'BOOST_TERMINE');
    }
    await changerStatutCampagne(boost.meta_campaign_id, 'ACTIVE');
    const resultat = await BoostModel.changerStatut(boost.id, ['en_pause'], 'actif');
    if (!resultat) {
      try {
        await changerStatutCampagne(boost.meta_campaign_id, 'PAUSED');
      } catch (err: any) {
        logger.error(`[BoostService] Pause Meta après reprise non enregistrée du boost #${boost.id} : ${err?.message}`);
      }
      throw new BoostErreur('Statut modifié entre-temps', 409, 'BOOST_NON_DIFFUSE');
    }
    await BoostEvenementModel.creer(boost.id, 'reprise', acteur);
    return resultat;
  }

  /** Clôture (fin de période, budget épuisé, rejet Meta ou action admin) : calcule le reliquat à rembourser. */
  static async cloturer(boost: Boost, acteur: BoostEvenement['acteur'], vers: 'termine' | 'rejete_meta' = 'termine', motif?: string | null): Promise<Boost> {
    if (boost.statut !== 'actif' && boost.statut !== 'en_pause') throw new BoostErreur("Ce boost n'est pas en diffusion", 409, 'BOOST_NON_DIFFUSE');
    if (boost.statut === 'actif' && boost.meta_campaign_id) {
      try {
        await changerStatutCampagne(boost.meta_campaign_id, 'PAUSED');
      } catch (err: any) {
        logger.warn(`[BoostService] Arrêt Meta du boost #${boost.id} impossible : ${err?.message}`);
      }
    }
    const totaux = await BoostInsightModel.totaux(boost.id);
    const cloture = calculerCloture(boost, totaux.depense_fcfa);
    const resultat = await BoostModel.changerStatut(boost.id, ['actif', 'en_pause'], vers, {
      depense_fcfa: cloture.depense_fcfa,
      date_cloture: new Date(),
      statut_remboursement: resteDu(boost) + cloture.montant_a_rembourser_fcfa > 0 ? 'a_rembourser' : 'aucun',
      montant_a_rembourser_fcfa: resteDu(boost) + cloture.montant_a_rembourser_fcfa,
      note_revue: vers === 'rejete_meta' ? motif ?? 'Publicité refusée par Meta' : undefined
    });
    if (!resultat) throw new BoostErreur('Statut modifié entre-temps', 409, 'BOOST_NON_DIFFUSE');
    await BoostEvenementModel.creer(boost.id, vers === 'rejete_meta' ? 'rejete_meta' : 'termine', acteur, { ...cloture, motif: motif ?? undefined });
    const remboursement = cloture.montant_a_rembourser_fcfa > 0 ? `À rembourser : ${formaterFcfa(cloture.montant_a_rembourser_fcfa)}` : null;
    if (vers === 'rejete_meta') {
      notifierBoost('boost_rejete_meta', resultat, 'Publicité rejetée par Meta', [`Motif : ${motif ?? 'non précisé'}`, remboursement]);
    }
    // Boost terminé : le remboursement reste provisoire 24 h (dépense Meta remontée en retard) ;
    // la notification « à rembourser » part avec le bilan définitif (reglerBilans).
    return resultat;
  }

  /** Importe les insights Meta jour par jour depuis le début de la diffusion ; renvoie les totaux. */
  static async importerInsights(boost: Boost) {
    const parametres = await BoostParametresModel.lire();
    const debut = boost.date_debut ? new Date(boost.date_debut) : new Date(boost.date_creation);
    const devise = await deviseCompte();
    const lignes = await lireInsights(boost.meta_campaign_id as string, dateIso(debut), dateIso(new Date()));
    for (const ligne of lignes) {
      await BoostInsightModel.upsert(boost.id, {
        date: ligne.date,
        depense_fcfa: depenseVersFcfa(ligne.depense, devise, parametres.fx_xaf_par_usd),
        depense_devise: ligne.depense,
        impressions: ligne.impressions,
        portee: ligne.portee,
        clics: ligne.clics,
        messages: ligne.messages,
        brut: ligne.brut
      });
    }
    return BoostInsightModel.totaux(boost.id);
  }

  /**
   * Bilans des boosts terminés : pendant 24 h après la clôture, la dépense Meta (remontée en retard) est
   * resynchronisée et le remboursement recalculé. Au-delà, le bilan devient définitif : événement
   * `bilan_final` et notification « à rembourser » s'il reste un montant dû au vendeur.
   */
  static async reglerBilans(): Promise<{ examines: number; finalises: number; erreurs: number }> {
    const boosts = await BoostModel.listerBilansEnCours();
    let finalises = 0;
    let erreurs = 0;
    for (const boost of boosts) {
      try {
        const totaux = await BoostService.importerInsights(boost);
        const cloture = calculerCloture(boost, totaux.depense_fcfa);
        const ancienne = await BoostEvenementModel.montantDerniereCloture(boost.id);
        const montant = montantApresBilan(boost.montant_a_rembourser_fcfa, ancienne, cloture.montant_a_rembourser_fcfa);
        const final = !bilanProvisoire(boost);
        if (cloture.depense_fcfa !== boost.depense_fcfa || montant !== boost.montant_a_rembourser_fcfa) {
          await BoostModel.mettreAJour(boost.id, {
            depense_fcfa: cloture.depense_fcfa,
            montant_a_rembourser_fcfa: montant,
            statut_remboursement: montant > 0 ? 'a_rembourser' : 'aucun'
          });
          if (!final) await BoostEvenementModel.creer(boost.id, 'bilan_provisoire', 'systeme', { ...cloture });
        }
        if (final) {
          await BoostEvenementModel.creer(boost.id, 'bilan_final', 'systeme', { ...cloture, montant_total_a_rembourser_fcfa: montant });
          finalises += 1;
          if (montant > 0) {
            notifierBoost('boost_a_rembourser', { ...boost, montant_a_rembourser_fcfa: montant }, 'Boost terminé : reliquat à rembourser', [
              `Dépensé : ${formaterFcfa(cloture.depense_fcfa)} sur ${formaterFcfa(boost.budget_media_fcfa)}`,
              `À rembourser : ${formaterFcfa(montant)}`
            ]);
          }
        }
      } catch (err: any) {
        erreurs += 1;
        logger.error(`[BoostService] Bilan du boost #${boost.id} en échec : ${err?.message}`);
      }
    }
    return { examines: boosts.length, finalises, erreurs };
  }

  /**
   * Premier constat « en ligne » d'un boost : événement `en_ligne` (une seule fois, même si plusieurs
   * synchros tournent en parallèle), puis Telegram à l'équipe, e-mail et WhatsApp au vendeur au passage
   * en revue → ACTIVE. Ne lève jamais : un échec d'envoi ne bloque pas la synchro.
   */
  static async traiterMiseEnLigne(boost: Boost, statutMeta: string, depuisVerification = false): Promise<void> {
    if (normaliserStatutEffectif(statutMeta) !== 'actif') return;
    if (!depuisVerification && normaliserStatutEffectif(boost.meta_statut_effectif ?? '') === 'actif') return;
    try {
      const notifier = doitNotifierMiseEnLigne(boost.meta_statut_effectif, statutMeta, boost.dry_run, boost.date_validation);
      const evenementId = await BoostEvenementModel.marquerEnLigne(boost.id, { statut_meta: statutMeta, notifie: notifier });
      if (!evenementId || !notifier) return;

      notifierBoost('boost_en_ligne', boost, 'Publicité acceptée par Meta et en ligne', [
        `Objectif : ${LIBELLES_OBJECTIF[boost.objectif] ?? boost.objectif}`,
        `Payé : ${formaterFcfa(boost.total_fcfa)} · budget Meta ${formaterFcfa(boost.budget_media_fcfa)}`,
        `Diffusion : du ${dateCourte(boost.date_debut)} au ${dateCourte(boost.date_fin)}`
      ]);

      const [vendeur, boutique] = await Promise.all([
        VendeurModel.getVendeurById(boost.vendeur_id).catch(() => null),
        BoutiqueModel.getBoutiqueById(boost.boutique_id).catch(() => null)
      ]);
      const slug = boutique?.slug ?? String(boost.boutique_id);
      const titre = boost.titre || boost.nom;
      const canalEmail = await BoostService.envoyerEmailEnLigne(boost, vendeur?.email, vendeur?.nom, boutique?.nom ?? slug, slug, titre);
      const canalWhatsapp = await BoostService.envoyerWhatsappEnLigne(boost, vendeur?.telephone, vendeur?.nom, slug, titre);
      await BoostEvenementModel.completer(evenementId, { canal_email: canalEmail, canal_whatsapp: canalWhatsapp });
    } catch (err: any) {
      logger.error(`[BoostService] Notification de mise en ligne du boost #${boost.id} en échec : ${err?.message}`);
    }
  }

  private static async envoyerEmailEnLigne(
    boost: Boost,
    email: string | null | undefined,
    nom: string | null | undefined,
    boutiqueNom: string,
    slug: string,
    titre: string
  ): Promise<CanalNotification> {
    if (!email) return 'sans_destinataire';
    try {
      await EmailService.envoyerBoostEnLigne(email, {
        vendeurNom: nom || 'cher vendeur',
        boutiqueNom,
        titrePub: titre,
        objectif: LIBELLES_OBJECTIF[boost.objectif] ?? boost.objectif,
        budget: formaterFcfa(boost.budget_media_fcfa),
        dateDebut: dateCourte(boost.date_debut),
        dateFin: dateCourte(boost.date_fin),
        lienSuivi: `${frontendUrl()}/admin/${slug}/boost/${boost.id}`
      });
      return process.env.RESEND_API_KEY ? 'ok' : 'simule';
    } catch (err: any) {
      logger.error(`[BoostService] E-mail de mise en ligne du boost #${boost.id} : ${err?.message}`);
      return 'echec';
    }
  }

  private static async envoyerWhatsappEnLigne(
    boost: Boost,
    telephone: string | null | undefined,
    nom: string | null | undefined,
    slug: string,
    titre: string
  ): Promise<CanalNotification> {
    if (!telephone) return 'sans_destinataire';
    if (!WhatsAppService.isMetaConfigured()) return 'simule';
    try {
      const id = await WhatsAppService.sendTemplateMessage(
        telephone,
        TEMPLATE_BOOST_EN_LIGNE.name,
        TEMPLATE_BOOST_EN_LIGNE.language,
        buildBoostEnLigneComponents({ vendeur: nom || 'bonjour', titre, dateFin: dateCourte(boost.date_fin), slug, boostId: boost.id })
      );
      return id ? 'ok' : 'echec';
    } catch (err: any) {
      logger.error(`[BoostService] WhatsApp de mise en ligne du boost #${boost.id} : ${err?.message}`);
      return 'echec';
    }
  }

  /**
   * Vérification rapide (tâche 5 min) des boosts publiés pas encore constatés en ligne : lecture du
   * seul statut de la publicité. Aucun appel Meta s'il n'y en a pas.
   */
  static async verifierMisesEnLigne(): Promise<{ examines: number; erreurs: number }> {
    const boosts = await BoostModel.listerEnRevue();
    let erreurs = 0;
    for (const boost of boosts) {
      try {
        const statut = await lireStatutPublicite(boost.meta_ad_id as string);
        await BoostService.traiterMiseEnLigne(boost, statut.effectiveStatus, true);
        if (statut.effectiveStatus && statut.effectiveStatus !== boost.meta_statut_effectif) {
          await BoostModel.mettreAJour(boost.id, { meta_statut_effectif: statut.effectiveStatus });
        }
      } catch (err: any) {
        erreurs += 1;
        logger.warn(`[BoostService] Statut Meta du boost #${boost.id} illisible : ${err?.message}`);
      }
    }
    return { examines: boosts.length, erreurs };
  }

  /** Synchronise insights + statut Meta d'un boost en diffusion, puis clôture si nécessaire. */
  static async synchroniser(boost: Boost): Promise<'ok' | 'termine' | 'rejete_meta' | 'ignore'> {
    if (!boost.meta_campaign_id || (boost.statut !== 'actif' && boost.statut !== 'en_pause')) return 'ignore';
    const totaux = await BoostService.importerInsights(boost);
    const depense = Math.min(boost.budget_media_fcfa, totaux.depense_fcfa);

    let statutMeta: Awaited<ReturnType<typeof lireStatutPublicite>> | null = null;
    if (boost.meta_ad_id) {
      try {
        statutMeta = await lireStatutPublicite(boost.meta_ad_id);
      } catch (err: any) {
        logger.warn(`[BoostService] Statut Meta du boost #${boost.id} illisible : ${err?.message}`);
      }
    }
    if (statutMeta) await BoostService.traiterMiseEnLigne(boost, statutMeta.effectiveStatus);
    const misAJour = (await BoostModel.mettreAJour(boost.id, {
      depense_fcfa: depense,
      meta_statut_effectif: statutMeta?.effectiveStatus ?? boost.meta_statut_effectif,
      meta_derniere_erreur: null,
      date_derniere_synchro: new Date()
    })) ?? boost;

    if (statutMeta?.statut === 'rejete') {
      await BoostService.cloturer(misAJour, 'meta', 'rejete_meta', statutMeta.motif);
      return 'rejete_meta';
    }
    if (estEchu(boost) || depense >= boost.budget_media_fcfa) {
      await BoostService.cloturer(misAJour, 'systeme', 'termine');
      return 'termine';
    }
    return 'ok';
  }

  /**
   * Rafraîchit les statistiques à l'ouverture du détail quand la dernière synchro date de plus de
   * `DELAI_FRAICHEUR_MS` (la tâche planifiée ne passe qu'une fois par heure). Une erreur Meta ne bloque
   * jamais l'affichage : le boost est alors renvoyé tel quel.
   */
  static async rafraichirSiPerime(boost: Boost): Promise<Boost> {
    if (!boost.meta_campaign_id || (boost.statut !== 'actif' && boost.statut !== 'en_pause')) return boost;
    const derniere = boost.date_derniere_synchro ? new Date(boost.date_derniere_synchro).getTime() : 0;
    // Un boost échu est synchronisé (donc clôturé) à l'ouverture, même si les stats sont récentes,
    // sauf si une synchro vient d'échouer (pas un appel Meta à chaque affichage)
    const echecRecent = Boolean(boost.meta_derniere_erreur) && Date.now() - new Date(boost.date_modification).getTime() < DELAI_FRAICHEUR_MS;
    if (estEchu(boost) ? echecRecent : Date.now() - derniere < DELAI_FRAICHEUR_MS) return boost;
    try {
      await BoostService.synchroniser(boost);
      return (await BoostModel.getById(boost.id)) ?? boost;
    } catch (err: any) {
      logger.warn(`[BoostService] Rafraîchissement du boost #${boost.id} impossible : ${err?.message}`);
      return boost;
    }
  }

  /** Synchronise les boosts en diffusion ; `echusSeulement` : clôture rapide de ceux dont la fin est passée. */
  static async synchroniserTous(echusSeulement = false): Promise<{ examines: number; termines: number; rejetes: number; erreurs: number }> {
    const boosts = await BoostModel.listerEnDiffusion(echusSeulement);
    // La clôture rapide (toutes les 5 min) ne sollicite Meta que s'il y a un boost échu ; la synchro
    // horaire vérifie la connexion dans tous les cas, comme avant.
    if (echusSeulement && !boosts.length) return { examines: 0, termines: 0, rejetes: 0, erreurs: 0 };
    await verifierSiNecessaire();
    let termines = 0;
    let rejetes = 0;
    let erreurs = 0;
    for (const boost of boosts) {
      try {
        const r = await BoostService.synchroniser(boost);
        if (r === 'termine') termines += 1;
        if (r === 'rejete_meta') rejetes += 1;
      } catch (err: any) {
        erreurs += 1;
        logger.error(`[BoostService] Synchro du boost #${boost.id} en échec : ${err?.message}`);
        await BoostModel.mettreAJour(boost.id, { meta_derniere_erreur: err?.message ?? 'Synchro impossible' });
      }
    }
    return { examines: boosts.length, termines, rejetes, erreurs };
  }

  static async marquerRembourse(
    boostId: number,
    note: string | null,
    admin: string,
    transfert: TransfertRemboursement | null = null
  ): Promise<Boost> {
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw introuvable();
    if (boost.statut_remboursement !== 'a_rembourser') throw new BoostErreur("Aucun remboursement en attente pour ce boost", 409, 'REMBOURSEMENT_INEXISTANT');
    if (bilanProvisoire(boost)) {
      const definitif = new Date(new Date(boost.date_cloture as unknown as string).getTime() + DELAI_BILAN_MS);
      throw new BoostErreur(
        `Montant provisoire : Meta peut encore ajuster la dépense jusqu'au ${definitif.toLocaleString('fr-FR', { timeZone: 'Africa/Libreville', dateStyle: 'short', timeStyle: 'short' })}. Remboursez après cette date.`,
        409,
        'BILAN_PROVISOIRE'
      );
    }
    // Les crédits « en trop » se lisent avant l'événement « rembourse » qui les solde.
    const paiementsEnTrop = await BoostEvenementModel.paiementsEnTropDepuisDernierRemboursement(boost.id);
    const resultat = await BoostModel.marquerRembourse(boost.id, note);
    if (!resultat) throw new BoostErreur('Ce remboursement vient déjà d’être enregistré', 409, 'REMBOURSEMENT_INEXISTANT');
    const evenementId = await BoostEvenementModel.creer(boost.id, 'rembourse', 'admin', {
      montant: boost.montant_a_rembourser_fcfa,
      note,
      admin,
      transfert: transfert ?? undefined
    });
    // E-mail en arrière-plan : la réponse à l'admin n'attend pas le fournisseur d'e-mail.
    void BoostService.envoyerEmailRembourse(boost, transfert, paiementsEnTrop).then((canal) =>
      evenementId ? BoostEvenementModel.completer(evenementId, { canal_email: canal }).catch(() => undefined) : undefined
    );
    return resultat;
  }

  /** E-mail explicatif au vendeur (motif, détail du calcul, transfert). Ne lève jamais. */
  private static async envoyerEmailRembourse(
    boost: Boost,
    transfert: TransfertRemboursement | null,
    paiementsEnTrop: number
  ): Promise<CanalNotification> {
    try {
      const [vendeur, boutique] = await Promise.all([
        VendeurModel.getVendeurById(boost.vendeur_id).catch(() => null),
        BoutiqueModel.getBoutiqueById(boost.boutique_id).catch(() => null)
      ]);
      if (!vendeur?.email) return 'sans_destinataire';
      const slug = boutique?.slug ?? String(boost.boutique_id);
      const explication = expliquerRemboursement(boost, paiementsEnTrop);
      await EmailService.envoyerBoostRembourse(vendeur.email, {
        vendeurNom: vendeur.nom || 'cher vendeur',
        boutiqueNom: boutique?.nom ?? slug,
        titrePub: boost.titre || boost.nom,
        montant: formaterFcfa(explication.montant),
        motif: explication.motif,
        lignes: explication.lignes.map((l) => ({
          libelle: l.libelle,
          montant: l.montant < 0 ? `- ${formaterFcfa(-l.montant)}` : formaterFcfa(l.montant)
        })),
        transfert: transfert
          ? {
              moyen: LIBELLES_MOYEN_VERSEMENT[transfert.moyen],
              telephone: transfert.telephone,
              reference: transfert.reference,
              date: dateCourte(new Date())
            }
          : null,
        lienSuivi: `${frontendUrl()}/admin/${slug}/boost/${boost.id}`
      });
      return process.env.RESEND_API_KEY ? 'ok' : 'simule';
    } catch (err: any) {
      logger.error(`[BoostService] E-mail de remboursement du boost #${boost.id} : ${err?.message}`);
      return 'echec';
    }
  }

  static async detail(boost: Boost, pourVendeur: boolean) {
    const [insights, totaux, evenements, transactions] = await Promise.all([
      BoostInsightModel.lister(boost.id),
      BoostInsightModel.totaux(boost.id),
      BoostEvenementModel.lister(boost.id),
      BoostTransactionModel.lister(boost.id)
    ]);
    if (pourVendeur) {
      const { conformite, valide_par, meta_derniere_erreur, meta_adset_id, meta_ad_id, ...visible } = boost;
      void conformite; void valide_par; void meta_derniere_erreur; void meta_adset_id; void meta_ad_id;
      return {
        boost: visible,
        insights,
        totaux,
        evenements: evenements
          .filter(
            (e) =>
              EVENEMENTS_VENDEUR.has(e.type_evenement) &&
              !(e.type_evenement === 'en_ligne' && (e.donnees as { notifie?: boolean } | null)?.notifie === false)
          )
          .map(({ id, type_evenement, date_creation }) => ({ id, type_evenement, date_creation })),
        transactions: transactions.map(({ id, montant, statut, methode_paiement, date_creation, date_confirmation }) => ({
          id, montant, statut, methode_paiement, date_creation, date_confirmation
        }))
      };
    }
    return { boost, insights, totaux, evenements, transactions };
  }
}
