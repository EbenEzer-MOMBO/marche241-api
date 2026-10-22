import { ModeScan, ResultatScan, SourceScan } from '../lib/database-types';
import {
  CodeScan,
  empreinteBillet,
  estCommandeValide,
  estDansFenetre,
  fenetreScan,
  FenetreScan,
  horodatageScan,
  lireQrBillet,
  TOLERANCE_HORLOGE_MS
} from '../lib/scanner/regles';
import { BilletControle, BilletScanModel } from '../models/billet-scan.model';
import { ProduitModel } from '../models/produit.model';
import { logger } from '../utils/logger';

/** Billet tel qu'affiché par le scanner (jamais de jeton). */
export interface BilletAffiche {
  id: number;
  numero: number;
  type_billet: string;
  titulaire: string;
  acheteur: string;
  telephone: string | null;
  numero_commande: string;
  scanne_le: Date | null;
}

export interface ResultatControle {
  success: boolean;
  code: CodeScan;
  message: string;
  billet?: BilletAffiche;
  scanne_le?: Date | null;
  /** MAUVAIS_EVENEMENT : nom de l'autre événement s'il appartient au même vendeur. */
  autre_evenement?: string | null;
  /** HORS_FENETRE */
  ouverture_scan?: Date;
  fermeture_scan?: Date;
}

export interface ContexteControle {
  produit: { id: number; variants?: any };
  vendeurId: number | null;
  mode: Exclude<ModeScan, 'dashboard'>;
  source: SourceScan;
  appareilId?: string | null;
  /** Horodatage appareil (scans hors-ligne) ; l'heure du serveur fait foi en ligne. */
  scanneA?: Date;
  qr?: string;
  billetId?: number;
}

const RESULTAT_PAR_CODE: Record<CodeScan, ResultatScan> = {
  SCAN_REUSSI: 'valide',
  BILLET_DEJA_SCANNE: 'deja_scanne',
  BILLET_INTROUVABLE: 'introuvable',
  MAUVAIS_EVENEMENT: 'mauvais_evenement',
  COMMANDE_NON_VALIDE: 'commande_non_valide',
  HORS_FENETRE: 'hors_fenetre',
  QR_INVALIDE: 'qr_invalide'
};

const formatHeure = (date: Date) =>
  date.toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

function afficher(billet: BilletControle, scanneLe: Date | null = billet.scanne_le): BilletAffiche {
  return {
    id: Number(billet.id),
    numero: billet.numero,
    type_billet: billet.type_billet,
    titulaire: billet.participant_nom?.trim() || billet.client_nom,
    acheteur: billet.client_nom,
    telephone: billet.participant_telephone?.trim() || billet.client_telephone || null,
    numero_commande: billet.numero_commande,
    scanne_le: scanneLe
  };
}

function metaProduit(produit: { variants?: any }): Record<string, unknown> {
  const meta = produit.variants?.meta;
  return meta && typeof meta === 'object' ? meta : {};
}

export type EtatScan = 'ouvert' | 'a_venir' | 'termine' | 'sans_date';

export function etatScan(fenetre: FenetreScan | null, maintenant = new Date()): EtatScan {
  if (!fenetre) return 'sans_date';
  if (maintenant < fenetre.ouverture) return 'a_venir';
  if (maintenant > fenetre.fermeture) return 'termine';
  return 'ouvert';
}

/** Événements terminés depuis plus longtemps : masqués du scanner. */
const MASQUER_TERMINES_APRES_MS = 30 * 24 * 60 * 60 * 1000;

export class ScannerService {
  static fenetre(produit: { variants?: any }): FenetreScan | null {
    return fenetreScan(metaProduit(produit));
  }

  static async evenements(vendeurId: number) {
    const maintenant = new Date();
    const lignes = await BilletScanModel.evenementsVendeur(vendeurId);
    return lignes
      .map((p) => {
        const meta = metaProduit(p);
        const fenetre = fenetreScan(meta);
        return {
          id: p.id,
          nom: p.nom,
          statut: p.statut,
          image: p.image_principale || p.images?.[0] || null,
          lieu: typeof meta.lieu === 'string' ? meta.lieu : null,
          boutique: { id: p.boutique_id, nom: p.boutique_nom, slug: p.boutique_slug },
          date_debut: fenetre?.debut ?? null,
          date_fin: fenetre?.fin ?? null,
          fin_par_defaut: fenetre?.fin_par_defaut ?? false,
          ouverture_scan: fenetre?.ouverture ?? null,
          fermeture_scan: fenetre?.fermeture ?? null,
          etat_scan: etatScan(fenetre, maintenant),
          billets_vendus: Number(p.billets_vendus),
          billets_scannes: Number(p.billets_scannes)
        };
      })
      .filter(
        (e) =>
          e.etat_scan !== 'termine' ||
          (e.fermeture_scan && maintenant.getTime() - e.fermeture_scan.getTime() < MASQUER_TERMINES_APRES_MS)
      );
  }

  /** Cache semi-offline : empreintes des billets (jamais les jetons). */
  static async billetsCache(produit: { id: number; variants?: any }, depuis?: Date) {
    const genereLe = new Date();
    const fenetre = fenetreScan(metaProduit(produit));
    const billets = await BilletScanModel.billetsCache(produit.id, depuis);
    return {
      genere_le: genereLe,
      complet: !depuis,
      fenetre: fenetre
        ? { ouverture: fenetre.ouverture, fermeture: fenetre.fermeture, fin_par_defaut: fenetre.fin_par_defaut }
        : null,
      billets: billets.map((b) => ({
        ...afficher(b),
        empreinte: empreinteBillet(b.jeton, b.numero),
        valide: estCommandeValide(b)
      }))
    };
  }

  /**
   * Contrôle d'un billet (QR ou saisie manuelle). Chaque tentative est journalisée ;
   * la validation est atomique, donc un billet n'entre qu'une fois même scanné en parallèle.
   */
  static async controler(ctx: ContexteControle): Promise<ResultatControle> {
    const recuLe = new Date();
    const instant = ctx.source === 'hors_ligne' && ctx.scanneA ? horodatageScan(ctx.scanneA, recuLe) : recuLe;
    const resultat = await this.evaluer(ctx, instant);

    try {
      await BilletScanModel.journaliser({
        produit_id: ctx.produit.id,
        billet_id: resultat.code === 'MAUVAIS_EVENEMENT' ? null : resultat.billet?.id ?? null,
        vendeur_id: ctx.vendeurId,
        resultat: RESULTAT_PAR_CODE[resultat.code],
        mode: ctx.mode,
        source: ctx.source,
        appareil_id: ctx.appareilId,
        scanne_a: instant ?? ctx.scanneA ?? recuLe
      });
    } catch (error: any) {
      // Le journal ne doit jamais bloquer l'entrée d'un participant
      logger.error('[ScannerService] Échec du journal de scan:', error.message);
    }

    return resultat;
  }

  private static async evaluer(ctx: ContexteControle, instant: Date | null): Promise<ResultatControle> {
    let billet: BilletControle | null = null;

    if (ctx.billetId !== undefined) {
      billet = await BilletScanModel.findControleById(ctx.billetId);
      if (!billet) {
        return { success: false, code: 'BILLET_INTROUVABLE', message: 'Billet introuvable' };
      }
    } else {
      const qr = lireQrBillet(ctx.qr);
      if (!qr) {
        return { success: false, code: 'QR_INVALIDE', message: "Ce QR code n'est pas un billet Marché 241" };
      }
      const candidats = await BilletScanModel.findByQr(qr.jeton, qr.numero);
      if (candidats.length === 0) {
        return { success: false, code: 'BILLET_INTROUVABLE', message: 'Billet introuvable' };
      }
      billet = candidats.find((b) => b.produit_id === ctx.produit.id) ?? candidats[0];
    }

    if (billet.produit_id !== ctx.produit.id) {
      const autre: any = await ProduitModel.getProduitById(billet.produit_id).catch(() => null);
      const memeVendeur = !!(autre && ctx.vendeurId && autre.boutique?.vendeur_id === ctx.vendeurId);
      return {
        success: false,
        code: 'MAUVAIS_EVENEMENT',
        message: memeVendeur ? `Billet d'un autre événement : ${autre.nom}` : "Ce billet n'est pas valable pour cet événement",
        autre_evenement: memeVendeur ? autre.nom : null
      };
    }

    const affiche = afficher(billet);
    const fenetre = fenetreScan(metaProduit(ctx.produit));
    const tolerance = ctx.source === 'hors_ligne' ? TOLERANCE_HORLOGE_MS : 0;
    if (!instant || !estDansFenetre(fenetre, instant, tolerance)) {
      return {
        success: false,
        code: 'HORS_FENETRE',
        message: !instant
          ? "L'horloge de l'appareil est incorrecte : scan refusé"
          : fenetre
            ? `Scan possible du ${formatHeure(fenetre.ouverture)} au ${formatHeure(fenetre.fermeture)}`
            : "L'événement n'a pas de date : scan impossible",
        billet: affiche,
        ouverture_scan: fenetre?.ouverture,
        fermeture_scan: fenetre?.fermeture
      };
    }

    if (!estCommandeValide(billet)) {
      const raison =
        billet.statut === 'annulee'
          ? 'commande annulée'
          : billet.statut === 'remboursee' || billet.statut_paiement === 'rembourse'
            ? 'commande remboursée'
            : 'commande non payée';
      return { success: false, code: 'COMMANDE_NON_VALIDE', message: `Billet refusé : ${raison}`, billet: affiche };
    }

    if (billet.scanne_le) {
      return this.dejaScanne(affiche, billet.scanne_le);
    }

    const scanneLe = await BilletScanModel.validerSiNonScanne(billet.id, instant);
    if (!scanneLe) {
      // Un autre appareil vient de valider ce billet
      const existant = await BilletScanModel.scanneLe(billet.id);
      return this.dejaScanne(affiche, existant);
    }

    return {
      success: true,
      code: 'SCAN_REUSSI',
      message: 'Billet validé',
      billet: { ...affiche, scanne_le: scanneLe },
      scanne_le: scanneLe
    };
  }

  private static dejaScanne(billet: BilletAffiche, scanneLe: Date | null): ResultatControle {
    return {
      success: false,
      code: 'BILLET_DEJA_SCANNE',
      message: scanneLe ? `Billet déjà scanné le ${formatHeure(new Date(scanneLe))}` : 'Billet déjà scanné',
      billet: { ...billet, scanne_le: scanneLe },
      scanne_le: scanneLe
    };
  }
}
