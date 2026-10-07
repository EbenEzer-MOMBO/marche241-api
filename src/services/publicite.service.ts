import crypto from 'crypto';
import { withTransaction } from '../config/database';
import { ProduitModel } from '../models/produit.model';
import {
  DonneesPublicite,
  PubliciteEvenementModel,
  PubliciteInteractionModel,
  PubliciteModel,
  PubliciteParametresModel,
  PubliciteReservationModel,
  PubliciteTransactionModel,
  ReservationConflitError
} from '../models/publicite.model';
import {
  BannierePubliciteDiffusee,
  Boutique,
  CibleTypePublicite,
  DisponibiliteSemaine,
  FormulePublicite,
  ModePaiementPublicite,
  PagePublicite,
  Publicite,
  PubliciteEvenement,
  PubliciteParametres,
  StatsPublicite,
  StatutPublicite,
  TypeInteractionPublicite
} from '../lib/database-types';
import { devisPublicite, DevisPublicite, remboursementProrata } from '../lib/publicite/devis';
import { CRENEAUX_FORMULE, creneauxPage, LIBELLES_FORMULE, lignesReservation } from '../lib/publicite/creneaux';
import {
  ajouterSemaines,
  bornesPeriode,
  erreurPeriode,
  libellePeriode,
  lundiCourant,
  semainesPeriode,
  semainesReservables
} from '../lib/publicite/semaines';
import { statutApresValidation } from '../lib/publicite/transitions';
import { ajouterUtmPublicite, erreurUrlExterne, urlBoutique, urlProduit } from '../lib/publicite/destination';
import { formaterFcfa } from '../lib/boost/devis';
import { nomPayeur, DemandePaiement } from './boost.service';
import { notifier } from './telegram.service';
import { EvenementNotification } from '../config/notifications.config';
import { PaiementController } from '../controllers/paiement.controller';
import { PushService } from './push.service';
import { logger } from '../utils/logger';

/**
 * Orchestration métier de la publicité interne (bannières sponsorisées). Cf. PLAN_PUB_INTERNE.md.
 * Cycle vendeur : brouillon → en_attente_paiement → en_attente_validation → programmee → active → terminee
 * (sorties : refusee, annulee). Les annonceurs externes sont créés directement en programmee/active.
 */

export class PubliciteErreur extends Error {
  constructor(message: string, public readonly statusHttp = 400, public readonly code = 'PUBLICITE_ERREUR') {
    super(message);
    this.name = 'PubliciteErreur';
  }
}

export type ErreurChamp = { field: string; message: string };

const introuvable = () => new PubliciteErreur('Publicité introuvable', 404, 'PUBLICITE_INTROUVABLE');

const frontendUrl = () => (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');

/** Statuts atteints seulement après qu'un paiement a déjà été pris en compte. */
const STATUTS_APRES_PAIEMENT = new Set<StatutPublicite>(['en_attente_validation', 'refusee', 'programmee', 'active', 'terminee', 'annulee']);

/** Événements du journal visibles par le vendeur (les autres restent internes). */
const EVENEMENTS_VENDEUR = new Set([
  'creation',
  'soumission',
  'paiement_confirme',
  'paiement_a_rembourser',
  'validee',
  'refusee',
  'debut_diffusion',
  'terminee',
  'annulee',
  'semaine_offerte',
  'rembourse',
  'liberation_paiement_expire'
]);

const PAGES: PagePublicite[] = ['accueil', 'produits', 'categorie', 'evenements', 'boutiques', 'autre'];
export const estPagePublicite = (page: unknown): page is PagePublicite => PAGES.includes(page as PagePublicite);

/** Notification Telegram de l'équipe (sans attente : n'interrompt jamais le flux). */
function notifierEquipe(evenement: EvenementNotification, publicite: Publicite, titre: string, lignes: Array<string | null> = []): void {
  void notifier(evenement, {
    titre,
    lignes: [
      `Annonceur : ${publicite.annonceur_nom}${publicite.type_annonceur === 'externe' ? ' (externe)' : ''}`,
      `Bannière #${publicite.id} · ${LIBELLES_FORMULE[publicite.formule]}${publicite.categorie ? ` — ${publicite.categorie.nom}` : ''}`,
      publicite.semaine_debut ? `Période : ${libellePeriode(publicite.semaine_debut, publicite.nb_semaines)}` : null,
      ...lignes
    ],
    lien: `/publicites/${publicite.id}`
  }).catch(() => undefined);
}

/** Notification push au vendeur annonceur (sans attente). */
function notifierVendeur(publicite: Publicite, title: string, body: string): void {
  if (publicite.type_annonceur !== 'vendeur' || !publicite.vendeur_id || !publicite.boutique) return;
  void PushService.sendToVendeur(publicite.vendeur_id, {
    title,
    body,
    url: `/admin/${publicite.boutique.slug}/boost/plateforme/${publicite.id}`
  }).catch(() => undefined);
}

/** Empreinte d'IP (jamais l'IP en clair) : sert au comptage des visiteurs uniques et à l'anti-rafale. */
export function empreinteIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const sel = process.env.JWT_SECRET || 'marche241';
  return crypto.createHash('sha256').update(`${sel}:${ip}`).digest('hex');
}

export interface DonneesBrouillonPublicite {
  formule?: FormulePublicite;
  categorie_id?: number | null;
  semaine_debut?: string | null;
  nb_semaines?: number;
  image_url?: string | null;
  image_mobile_url?: string | null;
  texte_alternatif?: string | null;
  cible_type?: CibleTypePublicite;
  produit_id?: number | null;
}

export interface DonneesPubliciteExterne {
  annonceur_nom: string;
  annonceur_contact?: string | null;
  formule: FormulePublicite;
  categorie_id?: number | null;
  semaine_debut: string;
  nb_semaines: number;
  image_url: string;
  image_mobile_url?: string | null;
  texte_alternatif?: string | null;
  url_destination: string;
  mode_paiement: Exclude<ModePaiementPublicite, 'ebilling'>;
  total_fcfa?: number | null; // montant négocié ; devis standard si absent
  reference_paiement_externe?: string | null;
}

export interface BilanPublicite {
  publicite: Publicite;
  stats: StatsPublicite;
  semaines: string[];
  garantie: { seuil_par_semaine: number; seuil_total: number; atteint: boolean; semaines_payees: number };
}

export class PubliciteService {
  // ---------------------------------------------------------------- Paramètres et éligibilité

  static async parametres(): Promise<PubliciteParametres> {
    return PubliciteParametresModel.lire();
  }

  /** Raison pour laquelle une boutique ne peut pas acheter de bannière, ou null si elle le peut. */
  static raisonIneligibilite(boutique: Pick<Boutique, 'est_verifiee' | 'statut'>, parametres: PubliciteParametres): string | null {
    if (!parametres.plateforme_active) return 'La mise en avant sur Marché 241 n\'est pas encore ouverte aux vendeurs';
    if (parametres.kill_switch) return 'Les réservations de bannières sont momentanément suspendues';
    if (boutique.statut !== 'active') return 'Votre boutique doit être active';
    if (parametres.eligibilite === 'verifiees' && !boutique.est_verifiee) return 'Réservé aux boutiques vérifiées';
    return null;
  }

  static async disponibilites(
    formule: FormulePublicite,
    categorieId: number | null,
    horizon?: number,
    exclurePubliciteId: number | null = null,
    semaineEnCours = false
  ): Promise<DisponibiliteSemaine[]> {
    const parametres = await PubliciteParametresModel.lire();
    const nombre = Math.min(Math.max(horizon ?? parametres.semaines_avance_max, 1), parametres.semaines_avance_max);
    const semaines = semaineEnCours
      ? semainesPeriode(lundiCourant(), nombre + 1)
      : semainesReservables(nombre);
    if (formule === 'categorie' && !categorieId) return semaines.map((semaine) => ({ semaine, libre: false }));
    const occupees = await PubliciteReservationModel.semainesOccupees(CRENEAUX_FORMULE[formule], categorieId, semaines, exclurePubliciteId);
    return semaines.map((semaine) => ({ semaine, libre: !occupees.has(semaine) }));
  }

  static async devis(formule: FormulePublicite, nbSemaines: number): Promise<DevisPublicite> {
    const parametres = await PubliciteParametresModel.lire();
    if (nbSemaines > parametres.semaines_max) {
      throw new PubliciteErreur(`Au plus ${parametres.semaines_max} semaines par réservation`, 400, 'DUREE_INVALIDE');
    }
    return devisPublicite(formule, nbSemaines, parametres.tarifs, parametres.remise_4_pour_3, parametres.frais_encaissement_bps);
  }

  // ---------------------------------------------------------------- Lecture

  static async getById(id: number): Promise<Publicite> {
    const publicite = await PubliciteModel.getById(id);
    if (!publicite) throw introuvable();
    return publicite;
  }

  static async detailVendeur(publicite: Publicite): Promise<{
    publicite: Publicite;
    stats: StatsPublicite;
    semaines: string[];
    evenements: PubliciteEvenement[];
    garantie: BilanPublicite['garantie'];
  }> {
    const bilan = await PubliciteService.bilan(publicite.id);
    const evenements = (await PubliciteEvenementModel.lister(publicite.id)).filter((e) => EVENEMENTS_VENDEUR.has(e.type_evenement));
    return { publicite: bilan.publicite, stats: bilan.stats, semaines: bilan.semaines, evenements, garantie: bilan.garantie };
  }

  static async bilan(id: number): Promise<BilanPublicite> {
    const publicite = await PubliciteService.getById(id);
    const parametres = await PubliciteParametresModel.lire();
    const stats = await PubliciteInteractionModel.stats(id);
    const semaines = publicite.semaine_debut ? semainesPeriode(publicite.semaine_debut, publicite.nb_semaines) : [];
    const semainesPayees = Math.max(0, publicite.nb_semaines - publicite.semaines_offertes);
    const seuil = parametres.garantie_affichages[publicite.formule] ?? 0;
    return {
      publicite,
      stats,
      semaines,
      garantie: {
        seuil_par_semaine: seuil,
        seuil_total: seuil * semainesPayees,
        atteint: stats.affichages >= seuil * semainesPayees,
        semaines_payees: semainesPayees
      }
    };
  }

  // ---------------------------------------------------------------- Parcours vendeur

  /** Construit le lien de destination d'un vendeur : sa boutique ou un de ses produits. */
  private static async destinationVendeur(boutique: Boutique, cible: CibleTypePublicite, produitId: number | null): Promise<string> {
    if (cible === 'produit') {
      if (!produitId) throw new PubliciteErreur('Choisissez le produit à mettre en avant', 400, 'PRODUIT_REQUIS');
      const produit = await ProduitModel.getProduitById(produitId);
      if (!produit || produit.boutique_id !== boutique.id) throw new PubliciteErreur('Produit introuvable', 404, 'PRODUIT_INTROUVABLE');
      return urlProduit(frontendUrl(), boutique.slug, produit.id);
    }
    return urlBoutique(frontendUrl(), boutique.slug);
  }

  static async creerBrouillon(boutique: Boutique, vendeurId: number, donnees: DonneesBrouillonPublicite): Promise<Publicite> {
    const cible = donnees.cible_type ?? 'boutique';
    const url = await PubliciteService.destinationVendeur(boutique, cible, donnees.produit_id ?? null);
    const publicite = await PubliciteModel.creer({
      type_annonceur: 'vendeur',
      boutique_id: boutique.id,
      vendeur_id: vendeurId,
      annonceur_nom: boutique.nom,
      formule: donnees.formule ?? 'accueil',
      categorie_id: donnees.formule === 'categorie' ? donnees.categorie_id ?? null : null,
      semaine_debut: donnees.semaine_debut ?? null,
      nb_semaines: donnees.nb_semaines ?? 1,
      image_url: donnees.image_url ?? null,
      image_mobile_url: donnees.image_mobile_url ?? null,
      texte_alternatif: donnees.texte_alternatif ?? null,
      cible_type: cible,
      produit_id: cible === 'produit' ? donnees.produit_id ?? null : null,
      url_destination: url,
      mode_paiement: 'ebilling'
    });
    await PubliciteEvenementModel.creer(publicite.id, 'creation', 'vendeur');
    return publicite;
  }

  static async modifierBrouillon(publicite: Publicite, boutique: Boutique, donnees: DonneesBrouillonPublicite): Promise<Publicite> {
    if (publicite.statut !== 'brouillon') throw new PubliciteErreur('Seul un brouillon peut être modifié', 409, 'PUBLICITE_NON_MODIFIABLE');
    const formule = donnees.formule ?? publicite.formule;
    const cible = donnees.cible_type ?? publicite.cible_type ?? 'boutique';
    const produitId = cible === 'produit' ? (donnees.produit_id !== undefined ? donnees.produit_id : publicite.produit_id) : null;
    const maj: DonneesPublicite = {
      formule,
      categorie_id: formule === 'categorie' ? (donnees.categorie_id !== undefined ? donnees.categorie_id : publicite.categorie_id) : null,
      semaine_debut: donnees.semaine_debut,
      nb_semaines: donnees.nb_semaines,
      image_url: donnees.image_url,
      image_mobile_url: donnees.image_mobile_url,
      texte_alternatif: donnees.texte_alternatif,
      cible_type: cible,
      produit_id: produitId,
      url_destination: await PubliciteService.destinationVendeur(boutique, cible, produitId)
    };
    const resultat = await PubliciteModel.mettreAJour(publicite.id, maj);
    if (!resultat) throw introuvable();
    return resultat;
  }

  static async supprimerBrouillon(publicite: Publicite): Promise<void> {
    if (!(await PubliciteModel.supprimerBrouillon(publicite.id))) {
      throw new PubliciteErreur('Seul un brouillon peut être supprimé', 409, 'PUBLICITE_NON_MODIFIABLE');
    }
  }

  static validerPourSoumission(publicite: Publicite, parametres: PubliciteParametres, maintenant: Date = new Date()): ErreurChamp[] {
    const erreurs: ErreurChamp[] = [];
    if (publicite.formule === 'categorie' && !publicite.categorie_id) erreurs.push({ field: 'categorie_id', message: 'Choisissez la catégorie' });
    if (publicite.nb_semaines > parametres.semaines_max) {
      erreurs.push({ field: 'nb_semaines', message: `Au plus ${parametres.semaines_max} semaines par réservation` });
    }
    const periode = erreurPeriode(publicite.semaine_debut, publicite.nb_semaines, parametres.semaines_avance_max, maintenant);
    if (periode) erreurs.push({ field: 'semaine_debut', message: periode });
    if (!publicite.image_url) erreurs.push({ field: 'image_url', message: 'Le visuel de la bannière est obligatoire' });
    if (!publicite.url_destination) erreurs.push({ field: 'url_destination', message: 'Lien de destination requis' });
    if (publicite.cible_type === 'produit' && !publicite.produit_id) erreurs.push({ field: 'produit_id', message: 'Choisissez le produit à mettre en avant' });
    return erreurs;
  }

  /** Fige le devis, réserve les semaines (exclusivité garantie par la base) et passe en attente de paiement. */
  static async soumettre(publicite: Publicite, boutique: Boutique): Promise<Publicite> {
    if (publicite.statut === 'en_attente_paiement') return publicite;
    if (publicite.statut !== 'brouillon') throw new PubliciteErreur('Cette publicité a déjà été soumise', 409, 'PUBLICITE_NON_MODIFIABLE');
    const parametres = await PubliciteParametresModel.lire();
    const raison = PubliciteService.raisonIneligibilite(boutique, parametres);
    if (raison) throw new PubliciteErreur(raison, 403, 'BOUTIQUE_NON_ELIGIBLE');
    const erreurs = PubliciteService.validerPourSoumission(publicite, parametres);
    if (erreurs.length) {
      const err = new PubliciteErreur('La publicité est incomplète', 400, 'VALIDATION_ERROR') as PubliciteErreur & { errors?: unknown };
      err.errors = erreurs.map((e) => ({ ...e, code: 'PUBLICITE_CHAMP_INVALIDE' }));
      throw err;
    }
    const devis = devisPublicite(publicite.formule, publicite.nb_semaines, parametres.tarifs, parametres.remise_4_pour_3, parametres.frais_encaissement_bps);
    const semaines = semainesPeriode(publicite.semaine_debut as string, publicite.nb_semaines);
    const bornes = bornesPeriode(publicite.semaine_debut as string, publicite.nb_semaines);
    const url = publicite.url_destination ? ajouterUtmPublicite(publicite.url_destination, publicite.id, frontendUrl()) : null;

    try {
      const resultat = await withTransaction(async (client) => {
        const maj = await PubliciteModel.changerStatut(
          publicite.id,
          ['brouillon'],
          'en_attente_paiement',
          {
            prix_semaine_fcfa: devis.prix_semaine_fcfa,
            remise_fcfa: devis.remise_fcfa,
            frais_encaissement_fcfa: devis.frais_encaissement_fcfa,
            total_fcfa: devis.total_fcfa,
            date_debut: bornes.date_debut,
            date_fin: bornes.date_fin,
            url_destination: url,
            date_soumission: new Date()
          },
          client
        );
        if (!maj) throw new PubliciteErreur('Cette publicité a déjà été soumise', 409, 'PUBLICITE_NON_MODIFIABLE');
        await PubliciteReservationModel.reserver(publicite.id, lignesReservation(publicite.formule, publicite.categorie_id, semaines), client);
        await PubliciteEvenementModel.creer(publicite.id, 'soumission', 'vendeur', { devis, semaines }, client);
        return maj;
      });
      return resultat;
    } catch (err) {
      if (err instanceof ReservationConflitError) throw new PubliciteErreur(err.message, 409, 'SEMAINE_INDISPONIBLE');
      throw err;
    }
  }

  /** Revient en brouillon (modification) tant qu'aucun paiement n'est confirmé ; libère les semaines. */
  static async annulerSoumission(publicite: Publicite): Promise<Publicite> {
    if (publicite.statut !== 'en_attente_paiement') {
      throw new PubliciteErreur('Cette publicité n\'est pas en attente de paiement', 409, 'PUBLICITE_NON_MODIFIABLE');
    }
    if ((await PubliciteTransactionModel.compterPayees(publicite.id)) > 0) {
      throw new PubliciteErreur('Un paiement a déjà été confirmé pour cette publicité', 409, 'PUBLICITE_DEJA_PAYEE');
    }
    const resultat = await withTransaction(async (client) => {
      const maj = await PubliciteModel.changerStatut(publicite.id, ['en_attente_paiement'], 'brouillon', { date_soumission: null }, client);
      if (!maj) throw new PubliciteErreur('Statut modifié entre-temps, rechargez la page', 409, 'PUBLICITE_NON_MODIFIABLE');
      await PubliciteReservationModel.liberer(publicite.id, null, client);
      await PubliciteEvenementModel.creer(publicite.id, 'retour_brouillon', 'vendeur', null, client);
      return maj;
    });
    return resultat;
  }

  /**
   * Initie le paiement eBilling. Le montant est celui figé côté serveur (jamais celui du client).
   * Le front vérifie ensuite via GET /paiements/verification/:bill_id (flux existant).
   */
  static async initierPaiement(publicite: Publicite, demande: DemandePaiement): Promise<{ bill_id: string; url?: string; transaction_id: number }> {
    if (publicite.statut !== 'en_attente_paiement') {
      throw new PubliciteErreur('Cette publicité n\'est pas en attente de paiement', 409, 'PUBLICITE_NON_PAYABLE');
    }
    const reference = `PUB-${publicite.id}-${Date.now()}`;
    const description = `Bannière ${LIBELLES_FORMULE[publicite.formule]} Marché 241`.slice(0, 100);
    const accessToken = await PaiementController.getAccessToken();
    const payeur = nomPayeur(demande.nom);
    const facture = await PaiementController.creerFacture(
      {
        email: demande.email || 'contact@marche241.ga',
        msisdn: demande.msisdn || '00000000000',
        amount: publicite.total_fcfa,
        reference,
        description,
        lastname: payeur.nom,
        firstname: payeur.prenom
      },
      accessToken
    );
    const billId: string | undefined = facture?.response?.e_bills?.[0]?.bill_id;
    if (!billId) throw new PubliciteErreur('Erreur lors de la création de la facture', 502, 'EBILLING_ERREUR');

    const transaction = await PubliciteTransactionModel.creer(publicite.id, {
      reference_transaction: reference,
      montant: publicite.total_fcfa,
      methode_paiement: demande.mode === 'carte' ? 'carte_bancaire' : demande.operateur === 'moovmoney' ? 'moov_money' : 'airtel_money',
      numero_telephone: demande.msisdn ?? null,
      reference_operateur: billId,
      description
    });

    if (demande.mode === 'carte') {
      if (!demande.return_url) throw new PubliciteErreur('URL de retour requise pour le paiement par carte');
      await PubliciteEvenementModel.creer(publicite.id, 'paiement_initie', 'vendeur', { bill_id: billId, mode: 'carte' });
      return { bill_id: billId, url: PaiementController.urlRedirectionCarte(billId, demande.return_url), transaction_id: transaction.id };
    }

    await PaiementController.envoyerUSSDPush(
      { bill_id: billId, payment_system_name: demande.operateur === 'moovmoney' ? 'moovmoney1' : 'airtelmoney', payer_msisdn: demande.msisdn },
      accessToken
    );
    await PubliciteEvenementModel.creer(publicite.id, 'paiement_initie', 'vendeur', { bill_id: billId, mode: 'mobile', operateur: demande.operateur });
    return { bill_id: billId, transaction_id: transaction.id };
  }

  /**
   * Appelé par la vérification eBilling quand une transaction de publicité est payée. Idempotent.
   * Si les semaines ont été libérées entre-temps (paiement tardif), on tente de les réserver à nouveau ;
   * si elles sont prises, ou si c'est un second paiement, le montant est ajouté au remboursement.
   */
  static async confirmerPaiement(publiciteId: number, transactionId: number, montant: number): Promise<void> {
    if (await PubliciteEvenementModel.paiementDejaTraite(publiciteId, transactionId)) return;

    const publicite = await PubliciteModel.changerStatut(publiciteId, ['en_attente_paiement'], 'en_attente_validation', { date_paiement: new Date() });
    if (publicite) {
      await PubliciteEvenementModel.creer(publiciteId, 'paiement_confirme', 'systeme', { transaction_id: transactionId, montant });
      logger.info(`[PubliciteService] Paiement confirmé pour la publicité #${publiciteId} (transaction ${transactionId})`);
      notifierEquipe('publicite_a_valider', publicite, 'Bannière payée à valider', [`Payé : ${formaterFcfa(publicite.total_fcfa)}`]);
      return;
    }

    const actuel = await PubliciteModel.getById(publiciteId);
    if (!actuel) {
      logger.error(`[PubliciteService] confirmerPaiement : publicité #${publiciteId} introuvable (transaction ${transactionId})`);
      return;
    }
    // Second poll de la même transaction déjà prise en compte : rien à faire.
    if (STATUTS_APRES_PAIEMENT.has(actuel.statut) && (await PubliciteTransactionModel.compterPayees(publiciteId)) <= 1) return;

    // Paiement tardif après libération des semaines (retour en brouillon) : nouvelle tentative de réservation.
    if (actuel.statut === 'brouillon' && actuel.semaine_debut && actuel.date_debut && new Date(actuel.date_debut) > new Date()) {
      try {
        const reprise = await withTransaction(async (client) => {
          const maj = await PubliciteModel.changerStatut(publiciteId, ['brouillon'], 'en_attente_validation', { date_paiement: new Date() }, client);
          if (!maj) return null;
          await PubliciteReservationModel.reserver(
            publiciteId,
            lignesReservation(actuel.formule, actuel.categorie_id, semainesPeriode(actuel.semaine_debut as string, actuel.nb_semaines)),
            client
          );
          await PubliciteEvenementModel.creer(publiciteId, 'paiement_confirme', 'systeme', { transaction_id: transactionId, montant, tardif: true }, client);
          return maj;
        });
        if (reprise) {
          notifierEquipe('publicite_a_valider', reprise, 'Bannière payée à valider (paiement tardif)', [`Payé : ${formaterFcfa(montant)}`]);
          return;
        }
      } catch (err) {
        if (!(err instanceof ReservationConflitError)) throw err;
      }
    }

    const note =
      actuel.statut === 'brouillon'
        ? `Paiement reçu après la libération des semaines, désormais indisponibles (transaction ${transactionId})`
        : `Paiement en double ou hors file (transaction ${transactionId}, statut « ${actuel.statut} »)`;
    const credite = await PubliciteEvenementModel.crediterRemboursementPaiement(publiciteId, transactionId, montant, note);
    if (!credite) return;
    logger.warn(`[PubliciteService] ${note} — publicité #${publiciteId}`);
    notifierEquipe('publicite_a_rembourser', actuel, 'Paiement de bannière à rembourser', [`Montant : ${formaterFcfa(montant)}`, note]);
  }

  // ---------------------------------------------------------------- Équipe Marché 241

  static async approuver(id: number, valideur: string, maintenant: Date = new Date()): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (publicite.statut !== 'en_attente_validation') {
      throw new PubliciteErreur('Cette publicité n\'est pas en attente de validation', 409, 'PUBLICITE_NON_VALIDABLE');
    }
    if (!publicite.date_debut || !publicite.date_fin) throw new PubliciteErreur('Période de diffusion manquante', 400, 'PERIODE_MANQUANTE');
    if (new Date(publicite.date_fin) <= maintenant) {
      throw new PubliciteErreur('La période réservée est déjà écoulée : refusez la publicité pour la rembourser', 409, 'PERIODE_ECOULEE');
    }
    const vers = statutApresValidation(new Date(publicite.date_debut), maintenant);
    const resultat = await PubliciteModel.changerStatut(id, ['en_attente_validation'], vers, { valide_par: valideur, date_validation: maintenant });
    if (!resultat) throw new PubliciteErreur('Statut modifié entre-temps', 409, 'PUBLICITE_NON_VALIDABLE');
    await PubliciteEvenementModel.creer(id, 'validee', 'admin', { valide_par: valideur, statut: vers });
    notifierVendeur(resultat, 'Bannière validée', `Votre bannière sera diffusée ${libellePeriode(resultat.semaine_debut as string, resultat.nb_semaines)}.`);
    return resultat;
  }

  /** Refus par l'équipe : semaines libérées, remboursement du montant payé hors frais d'encaissement. */
  static async refuser(id: number, note: string, valideur: string): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (publicite.statut !== 'en_attente_validation') {
      throw new PubliciteErreur('Cette publicité n\'est pas en attente de validation', 409, 'PUBLICITE_NON_VALIDABLE');
    }
    const montant = Math.max(0, publicite.total_fcfa - publicite.frais_encaissement_fcfa);
    const resultat = await withTransaction(async (client) => {
      const maj = await PubliciteModel.changerStatut(
        id,
        ['en_attente_validation'],
        'refusee',
        {
          note_revue: note,
          valide_par: valideur,
          date_validation: new Date(),
          date_cloture: new Date(),
          statut_remboursement: montant > 0 ? 'a_rembourser' : 'aucun',
          montant_a_rembourser_fcfa: publicite.montant_a_rembourser_fcfa + montant
        },
        client
      );
      if (!maj) throw new PubliciteErreur('Statut modifié entre-temps', 409, 'PUBLICITE_NON_VALIDABLE');
      await PubliciteReservationModel.liberer(id, null, client);
      await PubliciteEvenementModel.creer(id, 'refusee', 'admin', { note, valide_par: valideur, montant_a_rembourser_fcfa: montant }, client);
      return maj;
    });
    if (montant > 0) notifierEquipe('publicite_a_rembourser', resultat, 'Bannière refusée à rembourser', [`Montant : ${formaterFcfa(montant)}`]);
    notifierVendeur(resultat, 'Bannière refusée', `Motif : ${note}. Vous serez remboursé de ${formaterFcfa(montant)}.`);
    return resultat;
  }

  /** Bannière d'un annonceur externe, payée hors plateforme : réservée et validée directement. */
  static async creerExterne(donnees: DonneesPubliciteExterne, valideur: string, maintenant: Date = new Date()): Promise<Publicite> {
    const parametres = await PubliciteParametresModel.lire();
    const erreurs: ErreurChamp[] = [];
    const urlErreur = erreurUrlExterne(donnees.url_destination);
    if (urlErreur) erreurs.push({ field: 'url_destination', message: urlErreur });
    const periode = erreurPeriode(donnees.semaine_debut, donnees.nb_semaines, parametres.semaines_avance_max, maintenant, true);
    if (periode) erreurs.push({ field: 'semaine_debut', message: periode });
    if (donnees.formule === 'categorie' && !donnees.categorie_id) erreurs.push({ field: 'categorie_id', message: 'Choisissez la catégorie' });
    if (donnees.nb_semaines > parametres.semaines_max) {
      erreurs.push({ field: 'nb_semaines', message: `Au plus ${parametres.semaines_max} semaines par réservation` });
    }
    if (erreurs.length) {
      const err = new PubliciteErreur('La publicité est incomplète', 400, 'VALIDATION_ERROR') as PubliciteErreur & { errors?: unknown };
      err.errors = erreurs.map((e) => ({ ...e, code: 'PUBLICITE_CHAMP_INVALIDE' }));
      throw err;
    }

    const devis = devisPublicite(donnees.formule, donnees.nb_semaines, parametres.tarifs, parametres.remise_4_pour_3, 0);
    const total = donnees.mode_paiement === 'offert' ? 0 : donnees.total_fcfa ?? devis.total_fcfa;
    const semaines = semainesPeriode(donnees.semaine_debut, donnees.nb_semaines);
    const bornes = bornesPeriode(donnees.semaine_debut, donnees.nb_semaines);
    const statut = statutApresValidation(bornes.date_debut, maintenant);

    try {
      return await withTransaction(async (client) => {
        const publicite = await PubliciteModel.creer(
          {
            type_annonceur: 'externe',
            annonceur_nom: donnees.annonceur_nom.trim(),
            annonceur_contact: donnees.annonceur_contact ?? null,
            formule: donnees.formule,
            categorie_id: donnees.formule === 'categorie' ? donnees.categorie_id ?? null : null,
            statut,
            semaine_debut: donnees.semaine_debut,
            nb_semaines: donnees.nb_semaines,
            date_debut: bornes.date_debut,
            date_fin: bornes.date_fin,
            image_url: donnees.image_url,
            image_mobile_url: donnees.image_mobile_url ?? null,
            texte_alternatif: donnees.texte_alternatif ?? null,
            url_destination: donnees.url_destination.trim(),
            prix_semaine_fcfa: devis.prix_semaine_fcfa,
            remise_fcfa: Math.max(0, devis.sous_total_fcfa - total),
            frais_encaissement_fcfa: 0,
            total_fcfa: total,
            mode_paiement: donnees.mode_paiement,
            reference_paiement_externe: donnees.reference_paiement_externe ?? null,
            valide_par: valideur,
            date_validation: maintenant,
            date_soumission: maintenant,
            date_paiement: donnees.mode_paiement === 'offert' ? null : maintenant
          },
          client
        );
        await PubliciteReservationModel.reserver(publicite.id, lignesReservation(donnees.formule, publicite.categorie_id, semaines), client);
        await PubliciteEvenementModel.creer(publicite.id, 'creation_externe', 'admin', { valide_par: valideur, total_fcfa: total, semaines }, client);
        return publicite;
      });
    } catch (err) {
      if (err instanceof ReservationConflitError) throw new PubliciteErreur(err.message, 409, 'SEMAINE_INDISPONIBLE');
      throw err;
    }
  }

  /**
   * Annulation par l'équipe : les semaines non commencées sont libérées et remboursées au prorata
   * (hors frais d'encaissement si rien n'a été diffusé). Une bannière offerte n'est pas remboursée.
   */
  static async annuler(id: number, note: string, valideur: string, maintenant: Date = new Date()): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (publicite.statut !== 'programmee' && publicite.statut !== 'active') {
      throw new PubliciteErreur('Seule une publicité programmée ou en diffusion peut être annulée', 409, 'PUBLICITE_NON_ANNULABLE');
    }
    const semaines = publicite.semaine_debut ? semainesPeriode(publicite.semaine_debut, publicite.nb_semaines) : [];
    const lundi = lundiCourant(maintenant);
    const futures = semaines.filter((s) => s > lundi || (publicite.statut === 'programmee' && s >= lundi)).length;
    const payees = Math.max(0, publicite.nb_semaines - publicite.semaines_offertes);
    const montant =
      publicite.mode_paiement === 'offert' ? 0 : remboursementProrata(publicite.total_fcfa, publicite.frais_encaissement_fcfa, payees, Math.min(futures, payees));
    const aPartirDe = publicite.statut === 'programmee' ? null : ajouterSemaines(lundi, 1);

    const resultat = await withTransaction(async (client) => {
      const maj = await PubliciteModel.changerStatut(
        id,
        ['programmee', 'active'],
        'annulee',
        {
          note_revue: note,
          date_cloture: maintenant,
          ...(montant > 0
            ? { statut_remboursement: 'a_rembourser', montant_a_rembourser_fcfa: publicite.montant_a_rembourser_fcfa + montant }
            : {})
        },
        client
      );
      if (!maj) throw new PubliciteErreur('Statut modifié entre-temps', 409, 'PUBLICITE_NON_ANNULABLE');
      await PubliciteReservationModel.liberer(id, aPartirDe, client);
      await PubliciteEvenementModel.creer(id, 'annulee', 'admin', { note, valide_par: valideur, montant_a_rembourser_fcfa: montant }, client);
      return maj;
    });
    if (montant > 0) notifierEquipe('publicite_a_rembourser', resultat, 'Bannière annulée à rembourser', [`Montant : ${formaterFcfa(montant)}`]);
    notifierVendeur(resultat, 'Bannière annulée', montant > 0 ? `Vous serez remboursé de ${formaterFcfa(montant)}.` : note);
    return resultat;
  }

  /**
   * Garantie d'affichages : ajoute une semaine gratuite juste après la période (doit être libre et
   * ne pas être déjà passée). Une publicité terminée repart en programmée ou en diffusion.
   */
  static async offrirSemaine(id: number, valideur: string, maintenant: Date = new Date()): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (!['programmee', 'active', 'terminee'].includes(publicite.statut) || !publicite.semaine_debut) {
      throw new PubliciteErreur('Seule une publicité validée peut être prolongée', 409, 'PUBLICITE_NON_PROLONGEABLE');
    }
    const semaine = ajouterSemaines(publicite.semaine_debut, publicite.nb_semaines);
    if (semaine < lundiCourant(maintenant)) {
      throw new PubliciteErreur('La semaine suivant la période est déjà passée : créez une nouvelle bannière offerte', 409, 'SEMAINE_PASSEE');
    }
    const nb = publicite.nb_semaines + 1;
    const bornes = bornesPeriode(publicite.semaine_debut, nb);
    const vers: StatutPublicite =
      publicite.statut === 'terminee' ? statutApresValidation(bornesPeriode(semaine, 1).date_debut, maintenant) : publicite.statut;
    try {
      return await withTransaction(async (client) => {
        await PubliciteReservationModel.reserver(id, lignesReservation(publicite.formule, publicite.categorie_id, [semaine]), client);
        const maj = await PubliciteModel.changerStatut(
          id,
          [publicite.statut],
          vers,
          { nb_semaines: nb, semaines_offertes: publicite.semaines_offertes + 1, date_fin: bornes.date_fin, date_cloture: null },
          client
        );
        if (!maj) throw new PubliciteErreur('Statut modifié entre-temps', 409, 'PUBLICITE_NON_PROLONGEABLE');
        await PubliciteEvenementModel.creer(id, 'semaine_offerte', 'admin', { semaine, valide_par: valideur }, client);
        notifierVendeur(maj, 'Semaine offerte', `Votre bannière est prolongée gratuitement jusqu'au ${libellePeriode(semaine, 1).split('→ ')[1]}.`);
        return maj;
      });
    } catch (err) {
      if (err instanceof ReservationConflitError) throw new PubliciteErreur('La semaine suivante est déjà réservée', 409, 'SEMAINE_INDISPONIBLE');
      throw err;
    }
  }

  static async marquerRembourse(id: number, note: string | null, valideur: string): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (publicite.statut_remboursement !== 'a_rembourser') {
      throw new PubliciteErreur('Aucun remboursement en attente pour cette publicité', 409, 'AUCUN_REMBOURSEMENT');
    }
    const resultat = await PubliciteModel.mettreAJour(id, {
      statut_remboursement: 'rembourse',
      date_remboursement: new Date(),
      note_remboursement: note ?? publicite.note_remboursement
    });
    await PubliciteEvenementModel.creer(id, 'rembourse', 'admin', { montant: publicite.montant_a_rembourser_fcfa, note, valide_par: valideur });
    return resultat as Publicite;
  }

  static async marquerReseauxFait(id: number, valideur: string): Promise<Publicite> {
    const publicite = await PubliciteService.getById(id);
    if (publicite.formule !== 'premium') throw new PubliciteErreur('La publication réseaux concerne la formule Premium', 400, 'FORMULE_INVALIDE');
    const resultat = await PubliciteModel.mettreAJour(id, { publication_reseaux_faite: true });
    await PubliciteEvenementModel.creer(id, 'reseaux_publies', 'admin', { valide_par: valideur });
    return resultat as Publicite;
  }

  // ---------------------------------------------------------------- Cron

  /** Démarre, termine les diffusions et libère les semaines bloquées par un paiement non abouti. */
  static async rafraichirStatuts(maintenant: Date = new Date()): Promise<{ demarrees: number; terminees: number; liberees: number }> {
    let demarrees = 0;
    let terminees = 0;
    let liberees = 0;

    for (const publicite of await PubliciteModel.aDemarrer(maintenant)) {
      const maj = await PubliciteModel.changerStatut(publicite.id, ['programmee'], 'active');
      if (!maj) continue;
      demarrees += 1;
      await PubliciteEvenementModel.creer(publicite.id, 'debut_diffusion');
      notifierVendeur(maj, 'Bannière en ligne', 'Votre bannière est diffusée sur Marché 241 à partir d\'aujourd\'hui.');
    }

    for (const publicite of await PubliciteModel.aTerminer(maintenant)) {
      const maj = await PubliciteModel.changerStatut(publicite.id, ['programmee', 'active'], 'terminee', { date_cloture: maintenant });
      if (!maj) continue;
      terminees += 1;
      const bilan = await PubliciteService.bilan(publicite.id);
      await PubliciteEvenementModel.creer(publicite.id, 'terminee', 'systeme', {
        affichages: bilan.stats.affichages,
        clics: bilan.stats.clics,
        garantie_atteinte: bilan.garantie.atteint
      });
      notifierVendeur(
        maj,
        'Bilan de votre bannière',
        `${bilan.stats.affichages} affichages, ${bilan.stats.clics} clics. Consultez le bilan détaillé.`
      );
      if (!bilan.garantie.atteint && maj.mode_paiement !== 'offert') {
        notifierEquipe('publicite_sous_garantie', maj, 'Bannière sous le seuil d\'affichages garanti', [
          `Affichages : ${bilan.stats.affichages} / ${bilan.garantie.seuil_total} garantis`,
          'Action possible : offrir une semaine'
        ]);
      }
    }

    const parametres = await PubliciteParametresModel.lire();
    for (const publicite of await PubliciteModel.paiementsExpires(parametres.delai_paiement_minutes)) {
      const libere = await withTransaction(async (client) => {
        const maj = await PubliciteModel.changerStatut(publicite.id, ['en_attente_paiement'], 'brouillon', { date_soumission: null }, client);
        if (!maj) return false;
        await PubliciteReservationModel.liberer(publicite.id, null, client);
        await PubliciteEvenementModel.creer(publicite.id, 'liberation_paiement_expire', 'systeme', { delai_minutes: parametres.delai_paiement_minutes }, client);
        return true;
      });
      if (libere) liberees += 1;
    }

    if (demarrees || terminees || liberees) {
      logger.info(`[PubliciteService] Statuts : ${demarrees} démarrée(s), ${terminees} terminée(s), ${liberees} réservation(s) libérée(s)`);
    }
    return { demarrees, terminees, liberees };
  }

  // ---------------------------------------------------------------- Diffusion publique

  static async diffusion(page: PagePublicite, categorieId: number | null, maintenant: Date = new Date()): Promise<BannierePubliciteDiffusee[]> {
    const parametres = await PubliciteParametresModel.lire();
    if (parametres.kill_switch) return [];
    return PubliciteReservationModel.diffusion(lundiCourant(maintenant), creneauxPage(page, categorieId), maintenant);
  }

  /** Publicité diffusable à cet instant (statut et période), sinon null. */
  private static async diffusable(id: number, maintenant: Date): Promise<Publicite | null> {
    const publicite = await PubliciteModel.getById(id);
    if (!publicite || !['programmee', 'active'].includes(publicite.statut)) return null;
    if (!publicite.date_debut || !publicite.date_fin) return null;
    if (new Date(publicite.date_debut) > maintenant || new Date(publicite.date_fin) <= maintenant) return null;
    return publicite;
  }

  /**
   * Enregistre une interaction si la publicité est en diffusion. Anti-rafale : une même empreinte
   * n'est comptée qu'une fois par minute et par type.
   */
  static async enregistrerInteraction(
    id: number,
    type: TypeInteractionPublicite,
    page: PagePublicite,
    ip: string | null,
    maintenant: Date = new Date()
  ): Promise<Publicite | null> {
    const publicite = await PubliciteService.diffusable(id, maintenant);
    if (!publicite) return null;
    const empreinte = empreinteIp(ip);
    if (empreinte && (await PubliciteInteractionModel.recent(id, type, empreinte))) return publicite;
    await PubliciteInteractionModel.enregistrer(id, type, page, empreinte);
    return publicite;
  }

  /** URL de redirection d'un clic : celle enregistrée sur la publicité (jamais une URL fournie par la requête). */
  static async urlClic(id: number, page: PagePublicite, ip: string | null, compter: boolean): Promise<string> {
    const publicite = await PubliciteModel.getById(id);
    if (publicite && compter) await PubliciteService.enregistrerInteraction(id, 'clic', page, ip);
    return publicite?.url_destination || frontendUrl();
  }
}
