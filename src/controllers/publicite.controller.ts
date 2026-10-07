import { Request, Response } from 'express';
import { BoutiqueModel } from '../models/boutique.model';
import { PubliciteEvenementModel, PubliciteModel, PubliciteParametresModel, PubliciteReservationModel } from '../models/publicite.model';
import { estPagePublicite, PubliciteErreur, PubliciteService } from '../services/publicite.service';
import { Boutique, PagePublicite, Publicite } from '../lib/database-types';
import { FORMULES, LIBELLES_FORMULE, CRENEAUX_FORMULE } from '../lib/publicite/creneaux';
import { LIBELLES_STATUT_PUBLICITE } from '../lib/publicite/transitions';
import { ajouterSemaines, lundiCourant, semainesPeriode } from '../lib/publicite/semaines';
import { doitEnregistrerLaVue, getClientIp } from '../utils/view-tracking';
import { logger } from '../utils/logger';

const corps = (req: Request) => (req as any).validatedBody ?? req.body;
const params = (req: Request) => (req as any).validatedParams ?? req.params;
const requete = (req: Request) => (req as any).validatedQuery ?? req.query;

/** Robots et aperçus de liens : jamais comptés comme affichages ou clics. */
const AGENTS_ROBOTS = /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget/i;

/** Spécifications des visuels, communiquées au vendeur et au back-office. */
export const FORMATS_VISUEL = {
  desktop: { largeur: 1200, hauteur: 300, obligatoire: true },
  mobile: { largeur: 800, hauteur: 400, obligatoire: false },
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  poids_max_mo: 5
};

function repondreErreur(res: Response, err: unknown, contexte: string): void {
  if (err instanceof PubliciteErreur) {
    const errors = (err as PubliciteErreur & { errors?: unknown }).errors;
    res.status(err.statusHttp).json({ success: false, message: err.message, code: err.code, ...(errors ? { errors } : {}) });
    return;
  }
  logger.error(`[PubliciteController] ${contexte}:`, (err as Error)?.message ?? err);
  res.status(500).json({ success: false, message: `Erreur lors de ${contexte}` });
}

/** Charge la publicité et vérifie que le vendeur connecté possède sa boutique (l'admin passe toujours). */
async function chargerPubliciteAutorisee(req: Request, res: Response): Promise<Publicite | null> {
  const publicite = await PubliciteModel.getById(Number(params(req).id));
  if (!publicite) {
    res.status(404).json({ success: false, message: 'Publicité introuvable', code: 'PUBLICITE_INTROUVABLE' });
    return null;
  }
  if (req.isAdmin && !req.vendeur) return publicite;
  if (!req.vendeur || !publicite.boutique_id || !(await BoutiqueModel.isOwnedByVendeur(publicite.boutique_id, req.vendeur.id))) {
    res.status(403).json({ success: false, message: "Cette publicité n'appartient pas à l'une de vos boutiques" });
    return null;
  }
  return publicite;
}

async function chargerBoutique(boutiqueId: number, res: Response): Promise<Boutique | null> {
  const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);
  if (!boutique) {
    res.status(404).json({ success: false, message: 'Boutique introuvable', code: 'BOUTIQUE_INTROUVABLE' });
    return null;
  }
  return boutique;
}

/** Une interaction est comptée hors robots, admins, vendeur annonceur et IP locales/privées. */
function doitCompter(req: Request, publicite?: Publicite | null): boolean {
  if (AGENTS_ROBOTS.test(String(req.headers['user-agent'] ?? ''))) return false;
  return doitEnregistrerLaVue(req, publicite?.vendeur_id ?? undefined);
}

export class PubliciteController {
  // ---------------------------------------------------------------- public

  static async diffusion(req: Request, res: Response): Promise<void> {
    try {
      const { page, categorie_id } = requete(req);
      const bannieres = await PubliciteService.diffusion(page as PagePublicite, categorie_id ? Number(categorie_id) : null);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ success: true, bannieres });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des bannières');
    }
  }

  static async affichage(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(params(req).id);
      const { page } = corps(req);
      const publicite = await PubliciteModel.getById(id);
      if (publicite && doitCompter(req, publicite)) {
        await PubliciteService.enregistrerInteraction(id, 'affichage', page as PagePublicite, getClientIp(req));
      }
      res.status(204).end();
    } catch (err) {
      logger.warn('[PubliciteController] affichage non enregistré:', (err as Error)?.message);
      res.status(204).end();
    }
  }

  /** Redirection 302 vers le lien enregistré de la bannière (aucune URL lue dans la requête). */
  static async clic(req: Request, res: Response): Promise<void> {
    const id = Number(params(req).id);
    const page = estPagePublicite(requete(req).page) ? (requete(req).page as PagePublicite) : 'autre';
    try {
      const publicite = await PubliciteModel.getById(id);
      const url = await PubliciteService.urlClic(id, page, getClientIp(req), doitCompter(req, publicite));
      res.set('Cache-Control', 'no-store');
      res.redirect(302, url);
    } catch (err) {
      logger.warn('[PubliciteController] clic non enregistré:', (err as Error)?.message);
      res.redirect(302, (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, ''));
    }
  }

  // ---------------------------------------------------------------- vendeur

  static async getParametres(req: Request, res: Response): Promise<void> {
    try {
      const parametres = await PubliciteParametresModel.lire();
      const { boutique_id } = requete(req);
      let eligibilite: { eligible: boolean; raison: string | null } | null = null;
      if (boutique_id) {
        if (!req.isAdmin && !(await BoutiqueModel.isOwnedByVendeur(Number(boutique_id), req.vendeur!.id))) {
          res.status(403).json({ success: false, message: 'Cette boutique ne vous appartient pas' });
          return;
        }
        const boutique = await chargerBoutique(Number(boutique_id), res);
        if (!boutique) return;
        const raison = PubliciteService.raisonIneligibilite(boutique, parametres);
        eligibilite = { eligible: !raison, raison };
      }
      res.json({
        success: true,
        parametres: {
          tarifs: parametres.tarifs,
          remise_4_pour_3: parametres.remise_4_pour_3,
          semaines_max: parametres.semaines_max,
          semaines_avance_max: parametres.semaines_avance_max,
          garantie_affichages: parametres.garantie_affichages,
          frais_encaissement_bps: parametres.frais_encaissement_bps,
          plateforme_active: parametres.plateforme_active,
          kill_switch: parametres.kill_switch,
          formules: FORMULES.map((code) => ({ code, nom: LIBELLES_FORMULE[code], creneaux: CRENEAUX_FORMULE[code], prix_semaine_fcfa: parametres.tarifs[code] })),
          formats_visuel: FORMATS_VISUEL,
          statuts: LIBELLES_STATUT_PUBLICITE,
          eligibilite
        }
      });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des paramètres de publicité');
    }
  }

  static async disponibilites(req: Request, res: Response): Promise<void> {
    try {
      const { formule, categorie_id, semaines, exclure_id, semaine_en_cours } = requete(req);
      res.json({
        success: true,
        disponibilites: await PubliciteService.disponibilites(
          formule,
          categorie_id ? Number(categorie_id) : null,
          semaines ? Number(semaines) : undefined,
          exclure_id ? Number(exclure_id) : null,
          Boolean(semaine_en_cours) && Boolean(req.isAdmin && !req.vendeur)
        )
      });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des disponibilités');
    }
  }

  static async devis(req: Request, res: Response): Promise<void> {
    try {
      const { formule, nb_semaines } = corps(req);
      res.json({ success: true, devis: await PubliciteService.devis(formule, nb_semaines) });
    } catch (err) {
      repondreErreur(res, err, 'le calcul du devis');
    }
  }

  static async listerParBoutique(req: Request, res: Response): Promise<void> {
    try {
      const { boutiqueId } = params(req);
      res.json({ success: true, publicites: await PubliciteModel.listerParBoutique(Number(boutiqueId)) });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des publicités');
    }
  }

  static async creer(req: Request, res: Response): Promise<void> {
    try {
      const { boutique_id, ...donnees } = corps(req);
      const boutique = await chargerBoutique(Number(boutique_id), res);
      if (!boutique) return;
      const publicite = await PubliciteService.creerBrouillon(boutique, req.vendeur!.id, donnees);
      res.status(201).json({ success: true, publicite });
    } catch (err) {
      repondreErreur(res, err, 'la création de la publicité');
    }
  }

  static async detail(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      res.json({ success: true, ...(await PubliciteService.detailVendeur(publicite)) });
    } catch (err) {
      repondreErreur(res, err, 'la lecture de la publicité');
    }
  }

  static async modifier(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      const boutique = await chargerBoutique(publicite.boutique_id as number, res);
      if (!boutique) return;
      res.json({ success: true, publicite: await PubliciteService.modifierBrouillon(publicite, boutique, corps(req)) });
    } catch (err) {
      repondreErreur(res, err, 'la modification de la publicité');
    }
  }

  static async supprimer(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      await PubliciteService.supprimerBrouillon(publicite);
      res.json({ success: true, message: 'Brouillon supprimé' });
    } catch (err) {
      repondreErreur(res, err, 'la suppression de la publicité');
    }
  }

  static async soumettre(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      const boutique = await chargerBoutique(publicite.boutique_id as number, res);
      if (!boutique) return;
      res.json({ success: true, publicite: await PubliciteService.soumettre(publicite, boutique) });
    } catch (err) {
      repondreErreur(res, err, 'la soumission de la publicité');
    }
  }

  static async annulerSoumission(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      res.json({ success: true, publicite: await PubliciteService.annulerSoumission(publicite) });
    } catch (err) {
      repondreErreur(res, err, "l'annulation de la soumission");
    }
  }

  static async payer(req: Request, res: Response): Promise<void> {
    try {
      const publicite = await chargerPubliciteAutorisee(req, res);
      if (!publicite) return;
      const resultat = await PubliciteService.initierPaiement(publicite, {
        ...corps(req),
        email: req.vendeur?.email || null,
        nom: req.vendeur?.nom || null
      });
      res.json({
        success: true,
        bill_id: resultat.bill_id,
        transaction_id: resultat.transaction_id,
        ...(resultat.url ? { redirect: true, url: resultat.url } : {}),
        message: resultat.url ? 'Redirection vers la plateforme de paiement carte...' : 'Validez le paiement sur votre téléphone'
      });
    } catch (err) {
      repondreErreur(res, err, "l'initialisation du paiement de la publicité");
    }
  }

  // ---------------------------------------------------------------- back-office

  static async listerAdmin(req: Request, res: Response): Promise<void> {
    try {
      const filtres = requete(req);
      const { publicites, total } = await PubliciteModel.listerAdmin(filtres);
      res.json({ success: true, publicites, total, page: Number(filtres.page ?? 1), limite: Number(filtres.limite ?? 20) });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des publicités');
    }
  }

  static async statsAdmin(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, stats: await PubliciteModel.compterParStatut() });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des statistiques');
    }
  }

  static async planning(req: Request, res: Response): Promise<void> {
    try {
      const { debut, semaines } = requete(req);
      const premiere = debut || lundiCourant();
      const nombre = Number(semaines ?? 8);
      const liste = semainesPeriode(premiere, nombre);
      res.json({
        success: true,
        semaines: liste,
        lignes: await PubliciteReservationModel.planning(premiere, ajouterSemaines(premiere, nombre - 1))
      });
    } catch (err) {
      repondreErreur(res, err, 'la lecture du planning');
    }
  }

  static async creerExterne(req: Request, res: Response): Promise<void> {
    try {
      const { valide_par, ...donnees } = corps(req);
      res.status(201).json({ success: true, publicite: await PubliciteService.creerExterne(donnees, valide_par) });
    } catch (err) {
      repondreErreur(res, err, 'la création de la publicité externe');
    }
  }

  static async detailAdmin(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(params(req).id);
      const bilan = await PubliciteService.bilan(id);
      res.json({ success: true, ...bilan, evenements: await PubliciteEvenementModel.lister(id) });
    } catch (err) {
      repondreErreur(res, err, 'la lecture de la publicité');
    }
  }

  static async bilan(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, bilan: await PubliciteService.bilan(Number(params(req).id)) });
    } catch (err) {
      repondreErreur(res, err, 'la lecture du bilan');
    }
  }

  static async approuver(req: Request, res: Response): Promise<void> {
    try {
      const { valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.approuver(Number(params(req).id), valide_par), message: 'Bannière validée' });
    } catch (err) {
      repondreErreur(res, err, 'la validation de la publicité');
    }
  }

  static async refuser(req: Request, res: Response): Promise<void> {
    try {
      const { note, valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.refuser(Number(params(req).id), note, valide_par), message: 'Bannière refusée' });
    } catch (err) {
      repondreErreur(res, err, 'le refus de la publicité');
    }
  }

  static async annuler(req: Request, res: Response): Promise<void> {
    try {
      const { note, valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.annuler(Number(params(req).id), note, valide_par), message: 'Bannière annulée' });
    } catch (err) {
      repondreErreur(res, err, "l'annulation de la publicité");
    }
  }

  static async offrirSemaine(req: Request, res: Response): Promise<void> {
    try {
      const { valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.offrirSemaine(Number(params(req).id), valide_par), message: 'Semaine offerte' });
    } catch (err) {
      repondreErreur(res, err, "l'ajout de la semaine offerte");
    }
  }

  static async marquerRembourse(req: Request, res: Response): Promise<void> {
    try {
      const { note, valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.marquerRembourse(Number(params(req).id), note || null, valide_par) });
    } catch (err) {
      repondreErreur(res, err, 'le marquage du remboursement');
    }
  }

  static async marquerReseauxFait(req: Request, res: Response): Promise<void> {
    try {
      const { valide_par } = corps(req);
      res.json({ success: true, publicite: await PubliciteService.marquerReseauxFait(Number(params(req).id), valide_par) });
    } catch (err) {
      repondreErreur(res, err, 'le marquage de la publication réseaux');
    }
  }

  static async getParametresAdmin(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, parametres: await PubliciteParametresModel.lire(), formats_visuel: FORMATS_VISUEL });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des paramètres');
    }
  }

  static async majParametres(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, parametres: await PubliciteParametresModel.ecrire(corps(req)) });
    } catch (err) {
      repondreErreur(res, err, 'la mise à jour des paramètres');
    }
  }

  static async rafraichirStatuts(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, resultat: await PubliciteService.rafraichirStatuts() });
    } catch (err) {
      repondreErreur(res, err, 'le rafraîchissement des statuts');
    }
  }
}
