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
import { budgetParJour, devisDepuisTotal, estTotalDansBornes, formaterFcfa } from '../lib/boost/devis';
import { notifier } from './telegram.service';
import { EvenementNotification } from '../config/notifications.config';
import { calculerCloture, fraisEncaissement, remboursementIntegral } from '../lib/boost/reliquat';
import { ajouterUtmBoost, estDestinationMarche241 } from '../lib/boost/utm';
import { dateIso } from '../lib/boost/planning';
import { estConformiteComplete } from '../config/conformite-boost.config';
import {
  activerPublication,
  changerStatutCampagne,
  depenseVersFcfa,
  deviseCompte,
  exigerConnexionPrete,
  lireInsights,
  lireStatutPublicite,
  objectifMeta,
  publierBoost
} from './meta-ads.service';
import { estModeSimule, MetaConnexionErreur, verifierSiNecessaire } from './meta-connexion.service';
import { PaiementController } from '../controllers/paiement.controller';
import { logger } from '../utils/logger';

/**
 * Orchestration métier du boost publicitaire Meta (port du cycle de boost_meta, adapté au paiement à l'acte).
 * Cycle : brouillon → en_attente_paiement → en_attente_validation → actif ⇄ en_pause → termine
 * (sorties : refuse, rejete_meta, erreur). Cf. docs/BOOST_META.md.
 */

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
}

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
      image_url: donnees.image_url ?? null
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
    return resultat;
  }

  static async supprimerBrouillon(boost: Boost): Promise<void> {
    if (!(await BoostModel.supprimerBrouillon(boost.id))) {
      throw new BoostErreur('Seul un brouillon peut être supprimé', 409, 'BOOST_NON_MODIFIABLE');
    }
  }

  /** Liste les champs manquants ou invalides avant soumission (vide = soumettable). */
  static validerPourSoumission(boost: Boost, parametres: BoostParametres): Array<{ field: string; message: string }> {
    const erreurs: Array<{ field: string; message: string }> = [];
    if (!boost.titre || boost.titre.trim().length < 3) erreurs.push({ field: 'titre', message: 'Le titre doit contenir au moins 3 caractères' });
    if (!boost.texte_principal || boost.texte_principal.trim().length < 5) erreurs.push({ field: 'texte_principal', message: 'Le texte doit contenir au moins 5 caractères' });
    if (!boost.image_url) erreurs.push({ field: 'image_url', message: 'Un visuel est requis' });
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
        const devis = devisDepuisTotal(boost.total_fcfa, parametres.commission_bps, parametres.commission_min_fcfa, parametres.tva_bps);
        const parJour = budgetParJour(devis.budget_media_fcfa, boost.duree_jours);
        if (parJour < parametres.budget_jour_min_fcfa) {
          erreurs.push({
            field: 'duree_jours',
            message: `Budget publicitaire trop faible pour ${boost.duree_jours} jours (${formaterFcfa(parJour)} par jour, minimum ${formaterFcfa(parametres.budget_jour_min_fcfa)}) : augmentez le montant ou réduisez la durée`
          });
        }
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
    if (erreurs.length) {
      const err = new BoostErreur('Le boost est incomplet', 400, 'VALIDATION_ERROR') as BoostErreur & { errors?: unknown };
      err.errors = erreurs.map((e) => ({ ...e, code: 'BOOST_CHAMP_INVALIDE' }));
      throw err;
    }
    const devis = devisDepuisTotal(boost.total_fcfa, parametres.commission_bps, parametres.commission_min_fcfa, parametres.tva_bps);
    const url =
      boost.objectif !== 'whatsapp' && boost.url_destination && estDestinationMarche241(boost.url_destination, process.env.FRONTEND_URL)
        ? ajouterUtmBoost(boost.url_destination, boost.id)
        : boost.url_destination;
    const resultat = await BoostModel.changerStatut(boost.id, ['brouillon'], 'en_attente_paiement', {
      budget_media_fcfa: devis.budget_media_fcfa,
      commission_bps: devis.commission_bps,
      commission_fcfa: devis.commission_fcfa,
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
    if (!estConformiteComplete(conformite)) throw new BoostErreur('Checklist de conformité incomplète', 400, 'CONFORMITE_INCOMPLETE');
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw introuvable();
    if (boost.statut !== 'en_attente_validation' && boost.statut !== 'erreur') {
      throw new BoostErreur("Ce boost n'est pas en attente de validation", 409, 'BOOST_NON_VALIDABLE');
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

    try {
      const dejaCree = Boolean(boost.meta_campaign_id && boost.meta_adset_id && boost.meta_ad_id);
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
            nom: `M241 · boost_${boost.id} · ${(await BoutiqueModel.getBoutiqueById(boost.boutique_id))?.slug ?? boost.boutique_id}`,
            objectif: boost.objectif,
            budgetMediaFcfa: boost.budget_media_fcfa,
            dureeJours: boost.duree_jours,
            ciblage: boost.ciblage,
            urlDestination: boost.url_destination,
            whatsappE164: boost.whatsapp_e164,
            texte: boost.texte_principal ?? '',
            titre: boost.titre ?? boost.nom,
            description: boost.description,
            imageUrl: boost.image_url ?? '',
            fxXafParUsd: parametres.fx_xaf_par_usd
          });
      const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_validation', 'erreur'], 'actif', {
        meta_campaign_id: publication.campaignId,
        meta_adset_id: publication.adSetId,
        meta_ad_id: publication.adId,
        meta_derniere_erreur: null,
        dry_run: publication.dryRun,
        date_debut: publication.dateDebut,
        date_fin: publication.dateFin,
        conformite,
        valide_par: valideur,
        date_validation: new Date()
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
        dry_run: publication.dryRun,
        meta_campaign_id: publication.campaignId
      });
      return { boost: resultat };
    } catch (err: any) {
      if (err instanceof BoostErreur) throw err;
      const message = err?.message ?? 'Publication Meta impossible';
      logger.error(`[BoostService] Publication Meta du boost #${boost.id} en échec : ${message}`);
      const resultat = await BoostModel.changerStatut(boost.id, ['en_attente_validation', 'erreur'], 'erreur', {
        meta_derniere_erreur: message,
        conformite,
        valide_par: valideur
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
      montant_a_rembourser_fcfa: remboursementIntegral(boost)
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
      statut_remboursement: cloture.montant_a_rembourser_fcfa > 0 ? 'a_rembourser' : 'aucun',
      montant_a_rembourser_fcfa: boost.montant_a_rembourser_fcfa + cloture.montant_a_rembourser_fcfa,
      note_revue: vers === 'rejete_meta' ? motif ?? 'Publicité refusée par Meta' : undefined
    });
    if (!resultat) throw new BoostErreur('Statut modifié entre-temps', 409, 'BOOST_NON_DIFFUSE');
    await BoostEvenementModel.creer(boost.id, vers === 'rejete_meta' ? 'rejete_meta' : 'termine', acteur, { ...cloture, motif: motif ?? undefined });
    const remboursement = cloture.montant_a_rembourser_fcfa > 0 ? `À rembourser : ${formaterFcfa(cloture.montant_a_rembourser_fcfa)}` : null;
    if (vers === 'rejete_meta') {
      notifierBoost('boost_rejete_meta', resultat, 'Publicité rejetée par Meta', [`Motif : ${motif ?? 'non précisé'}`, remboursement]);
    } else if (remboursement) {
      notifierBoost('boost_a_rembourser', resultat, 'Boost terminé : reliquat à rembourser', [
        `Dépensé : ${formaterFcfa(cloture.depense_fcfa)} sur ${formaterFcfa(boost.budget_media_fcfa)}`,
        remboursement
      ]);
    }
    return resultat;
  }

  /** Synchronise insights + statut Meta d'un boost en diffusion, puis clôture si nécessaire. */
  static async synchroniser(boost: Boost): Promise<'ok' | 'termine' | 'rejete_meta' | 'ignore'> {
    if (!boost.meta_campaign_id || (boost.statut !== 'actif' && boost.statut !== 'en_pause')) return 'ignore';
    const parametres = await BoostParametresModel.lire();
    const debut = boost.date_debut ? new Date(boost.date_debut) : new Date(boost.date_creation);
    const aujourdhui = new Date();
    const devise = await deviseCompte();
    const lignes = await lireInsights(boost.meta_campaign_id, dateIso(debut), dateIso(aujourdhui));
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
    const totaux = await BoostInsightModel.totaux(boost.id);
    const depense = Math.min(boost.budget_media_fcfa, totaux.depense_fcfa);

    let statutMeta: Awaited<ReturnType<typeof lireStatutPublicite>> | null = null;
    if (boost.meta_ad_id) {
      try {
        statutMeta = await lireStatutPublicite(boost.meta_ad_id);
      } catch (err: any) {
        logger.warn(`[BoostService] Statut Meta du boost #${boost.id} illisible : ${err?.message}`);
      }
    }
    const misAJour = (await BoostModel.mettreAJour(boost.id, {
      depense_fcfa: depense,
      meta_statut_effectif: statutMeta?.effectiveStatus ?? boost.meta_statut_effectif,
      date_derniere_synchro: new Date()
    })) ?? boost;

    if (statutMeta?.statut === 'rejete') {
      await BoostService.cloturer(misAJour, 'meta', 'rejete_meta', statutMeta.motif);
      return 'rejete_meta';
    }
    const finAtteinte = boost.date_fin ? new Date(boost.date_fin).getTime() <= Date.now() : false;
    if (finAtteinte || depense >= boost.budget_media_fcfa) {
      await BoostService.cloturer(misAJour, 'systeme', 'termine');
      return 'termine';
    }
    return 'ok';
  }

  static async synchroniserTous(): Promise<{ examines: number; termines: number; rejetes: number; erreurs: number }> {
    await verifierSiNecessaire();
    const boosts = await BoostModel.listerEnDiffusion();
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

  static async marquerRembourse(boostId: number, note: string | null, admin: string): Promise<Boost> {
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw introuvable();
    if (boost.statut_remboursement !== 'a_rembourser') throw new BoostErreur("Aucun remboursement en attente pour ce boost", 409, 'REMBOURSEMENT_INEXISTANT');
    const resultat = await BoostModel.mettreAJour(boost.id, {
      statut_remboursement: 'rembourse',
      date_remboursement: new Date(),
      note_remboursement: note ?? boost.note_remboursement
    });
    await BoostEvenementModel.creer(boost.id, 'rembourse', 'admin', { montant: boost.montant_a_rembourser_fcfa, note, admin });
    return resultat ?? boost;
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
          .filter((e) => EVENEMENTS_VENDEUR.has(e.type_evenement))
          .map(({ id, type_evenement, date_creation }) => ({ id, type_evenement, date_creation })),
        transactions: transactions.map(({ id, montant, statut, methode_paiement, date_creation, date_confirmation }) => ({
          id, montant, statut, methode_paiement, date_creation, date_confirmation
        }))
      };
    }
    return { boost, insights, totaux, evenements, transactions };
  }
}
