import { createHmac, timingSafeEqual } from 'node:crypto';
import { formaterFcfa } from '../lib/boost/devis';
import { LIBELLES_STATUT_BOOST } from '../lib/boost/transitions';
import { BoostParametres, StatutBoost } from '../lib/database-types';
import { BoostEvenementModel, BoostModel, BoostParametresModel, BoostRelanceLigne, BoostRelanceModel } from '../models/boost.model';
import { EmailService } from './email.service';
import { vendeurRelanceBoostsTemplate } from './email-templates';
import { BoostErreur } from './boost.service';
import { WhatsAppService } from './whatsapp.service';
import { META_TEMPLATES, buildRelanceBoostsComponents } from './whatsapp-templates';
import { logger } from '../utils/logger';

const FUSEAU = 'Africa/Libreville';
const STATUTS_OUVERTS = new Set<StatutBoost>(['brouillon', 'en_attente_paiement']);

export type ModeRelance = 'auto' | 'manuel';
export type CanalRelance = 'ok' | 'simule' | 'echec' | 'inactif' | 'sans_destinataire';

export interface BilanRelances {
  boutiques_examinees: number;
  relancees: number;
  whatsapp_ok: number;
  email_ok: number;
  erreurs: number;
}

export interface ResultatRelance {
  boutique_id: number;
  boost_ids: number[];
  mode: ModeRelance;
  canal_whatsapp: CanalRelance;
  canal_email: CanalRelance;
}

const bilanVide = (): BilanRelances => ({
  boutiques_examinees: 0,
  relancees: 0,
  whatsapp_ok: 0,
  email_ok: 0,
  erreurs: 0
});

function secretDesinscription(): string {
  return process.env.RELANCE_DESINSCRIPTION_SECRET || process.env.JWT_SECRET || 'relance-boosts';
}

export function jetonDesinscription(vendeurId: number): string {
  const charge = Buffer.from(String(vendeurId), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secretDesinscription()).update(charge).digest('base64url');
  return `${charge}.${signature}`;
}

export function verifierJeton(jeton: string): number | null {
  const point = jeton.indexOf('.');
  if (point <= 0) return null;
  const charge = jeton.slice(0, point);
  const signature = jeton.slice(point + 1);
  const attendue = createHmac('sha256', secretDesinscription()).update(charge).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Number(Buffer.from(charge, 'base64url').toString('utf8'));
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** Heure locale de Libreville (0-23), sans changement d'heure. */
export function heureLibreville(date = new Date()): number {
  const partie = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSEAU,
    hour: 'numeric',
    hourCycle: 'h23'
  })
    .formatToParts(date)
    .find((p) => p.type === 'hour');
  return Number(partie?.value ?? '0');
}

/**
 * La relance n°(n+1) est due si n est sous le maximum et que le délai
 * initial plus n intervalles se sont écoulés depuis date_modification.
 * n doit déjà exclure les relances antérieures à la dernière modification.
 */
export function relanceDue(
  dateModification: Date,
  nombreRelances: number,
  delaiInitialHeures: number,
  intervalleHeures: number,
  maximum: number,
  maintenant = new Date()
): boolean {
  if (nombreRelances >= maximum) return false;
  const echeance = dateModification.getTime() + (delaiInitialHeures + nombreRelances * intervalleHeures) * 3_600_000;
  return maintenant.getTime() >= echeance;
}

/** « 2 boost(s) en brouillon et 1 boost(s) en attente de paiement ». */
export function resumeBoosts(boosts: Array<{ statut: string }>): string {
  const brouillons = boosts.filter((b) => b.statut === 'brouillon').length;
  const attente = boosts.filter((b) => b.statut === 'en_attente_paiement').length;
  const parties: string[] = [];
  if (brouillons > 0) parties.push(`${brouillons} boost(s) en brouillon`);
  if (attente > 0) parties.push(`${attente} boost(s) en attente de paiement`);
  if (parties.length === 0) return 'des boost(s) à finaliser';
  if (parties.length === 1) return parties[0];
  return `${parties[0]} et ${parties[1]}`;
}

function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function remplacer(modele: string, variables: Record<string, string>): string {
  return modele.replace(/\{(vendeur|boutique|resume)\}/g, (_tout, cle: string) => variables[cle] ?? '');
}

function canalReussi(canal: CanalRelance): boolean {
  return canal === 'ok' || canal === 'simule';
}

function urlApi(): string {
  const base = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
  const prefixe = process.env.API_PREFIX || '/api/v1';
  return `${base}${prefixe}`;
}

function urlFront(): string {
  return (process.env.FRONTEND_URL || 'https://marche241.ga').replace(/\/$/, '');
}

export class BoostRelanceService {
  static async executerRelancesAuto(maintenant = new Date()): Promise<BilanRelances> {
    const parametres = await BoostParametresModel.lire();
    const bilan = bilanVide();
    if (!parametres.relance_active || parametres.kill_switch) return bilan;
    if (heureLibreville(maintenant) !== parametres.relance_heure_envoi) return bilan;
    if (!parametres.relance_whatsapp_active && !parametres.relance_email_active) return bilan;

    const lignes = await BoostRelanceModel.listerEligibles(parametres.relance_age_max_jours);
    const parBoutique = new Map<number, BoostRelanceLigne[]>();
    for (const ligne of lignes) {
      const groupe = parBoutique.get(ligne.boutique_id) ?? [];
      groupe.push(ligne);
      parBoutique.set(ligne.boutique_id, groupe);
    }
    bilan.boutiques_examinees = parBoutique.size;

    for (const [boutiqueId, boosts] of parBoutique) {
      try {
        const dus = boosts.filter((b) =>
          relanceDue(
            b.date_modification,
            b.relances_depuis_modification,
            parametres.relance_delai_initial_heures,
            parametres.relance_intervalle_heures,
            parametres.relance_max,
            maintenant
          )
        );
        if (dus.length === 0) continue;
        const derniere = await BoostRelanceModel.derniereRelanceBoutique(boutiqueId);
        if (derniere && maintenant.getTime() < derniere.getTime() + parametres.relance_intervalle_heures * 3_600_000) {
          continue;
        }
        const resultat = await BoostRelanceService.envoyer(boosts, dus, 'auto', 'systeme', parametres);
        if (canalReussi(resultat.canal_whatsapp) || canalReussi(resultat.canal_email)) {
          bilan.relancees += 1;
        } else {
          bilan.erreurs += 1;
        }
        if (canalReussi(resultat.canal_whatsapp)) bilan.whatsapp_ok += 1;
        if (canalReussi(resultat.canal_email)) bilan.email_ok += 1;
      } catch (err) {
        bilan.erreurs += 1;
        logger.error(`[BoostRelance] boutique ${boutiqueId}:`, (err as Error)?.message ?? err);
      }
    }
    return bilan;
  }

  /** Relance immédiate de la boutique d'un boost, sans délai, heure ni maximum. */
  static async relancerDepuisBoost(boostId: number, acteur: string): Promise<ResultatRelance> {
    const boost = await BoostModel.getById(boostId);
    if (!boost) throw new BoostErreur('Boost introuvable', 404, 'BOOST_INTROUVABLE');
    if (!STATUTS_OUVERTS.has(boost.statut)) {
      throw new BoostErreur("Ce boost n'est plus à finaliser", 409, 'STATUT_INCOMPATIBLE');
    }
    return BoostRelanceService.relancerBoutique(boost.boutique_id, 'manuel', acteur);
  }

  static async relancerBoutique(boutiqueId: number, mode: ModeRelance, acteur: string): Promise<ResultatRelance> {
    const parametres = await BoostParametresModel.lire();
    const ouverts = await BoostRelanceModel.boostsOuvertsBoutique(boutiqueId);
    if (ouverts.length === 0) {
      throw new BoostErreur('Aucun boost à finaliser pour cette boutique', 409, 'AUCUN_BOOST');
    }
    const vendeur = ouverts[0];
    if (vendeur.relances_boost_desinscrit_le) {
      throw new BoostErreur('Ce vendeur ne souhaite plus recevoir de relances', 409, 'VENDEUR_DESINSCRIT');
    }
    if (!parametres.relance_whatsapp_active && !parametres.relance_email_active) {
      throw new BoostErreur('Les relances WhatsApp et e-mail sont désactivées', 409, 'CANAUX_COUPES');
    }
    const dus = mode === 'manuel' ? ouverts : ouverts;
    return BoostRelanceService.envoyer(ouverts, dus, mode, acteur, parametres);
  }

  private static async envoyer(
    resumeDe: BoostRelanceLigne[],
    dus: BoostRelanceLigne[],
    mode: ModeRelance,
    acteur: string,
    parametres: BoostParametres
  ): Promise<ResultatRelance> {
    const reference = resumeDe[0];
    const resume = resumeBoosts(resumeDe);
    const variables = {
      vendeur: reference.vendeur_nom || 'bonjour',
      boutique: reference.boutique_nom,
      resume
    };
    const jeton = jetonDesinscription(reference.vendeur_id);
    const lienPage = `${urlFront()}/desinscription/relances-boost?jeton=${encodeURIComponent(jeton)}`;
    const lienOneClick = `${urlApi()}/boosts/relances/desinscription?jeton=${encodeURIComponent(jeton)}`;
    const cta = `${urlFront()}/admin/${reference.boutique_slug}/boost`;

    const canalWhatsapp = await BoostRelanceService.envoyerWhatsapp(reference, variables, jeton, parametres);
    const canalEmail = await BoostRelanceService.envoyerEmail(
      reference,
      resumeDe,
      variables,
      parametres,
      cta,
      lienPage,
      lienOneClick
    );

    const colonneActeur = mode === 'manuel' ? 'admin' : 'systeme';
    for (const boost of dus) {
      await BoostEvenementModel.creer(boost.id, 'relance', colonneActeur, {
        mode,
        canal_whatsapp: canalWhatsapp,
        canal_email: canalEmail,
        numero: boost.relances_depuis_modification + 1,
        acteur
      });
    }

    return {
      boutique_id: reference.boutique_id,
      boost_ids: dus.map((b) => b.id),
      mode,
      canal_whatsapp: canalWhatsapp,
      canal_email: canalEmail
    };
  }

  private static async envoyerWhatsapp(
    ligne: BoostRelanceLigne,
    variables: Record<string, string>,
    jeton: string,
    parametres: BoostParametres
  ): Promise<CanalRelance> {
    if (!parametres.relance_whatsapp_active) return 'inactif';
    if (!ligne.vendeur_telephone) return 'sans_destinataire';
    if (!WhatsAppService.isMetaConfigured()) {
      logger.debug(`[BoostRelance] WhatsApp simulé vers ${ligne.vendeur_telephone} (${ligne.boutique_slug})`);
      return 'simule';
    }
    try {
      const id = await WhatsAppService.sendTemplateMessage(
        ligne.vendeur_telephone,
        META_TEMPLATES.relanceBoosts.name,
        META_TEMPLATES.relanceBoosts.language,
        buildRelanceBoostsComponents({
          vendeur: variables.vendeur,
          boutique: variables.boutique,
          resume: variables.resume,
          slug: ligne.boutique_slug,
          jeton
        })
      );
      return id ? 'ok' : 'echec';
    } catch (err) {
      logger.error(`[BoostRelance] WhatsApp ${ligne.boutique_slug}:`, (err as Error)?.message ?? err);
      return 'echec';
    }
  }

  private static async envoyerEmail(
    ligne: BoostRelanceLigne,
    boosts: BoostRelanceLigne[],
    variables: Record<string, string>,
    parametres: BoostParametres,
    cta: string,
    lienPage: string,
    lienOneClick: string
  ): Promise<CanalRelance> {
    if (!parametres.relance_email_active) return 'inactif';
    if (!ligne.vendeur_email) return 'sans_destinataire';
    const variablesHtml = {
      vendeur: echapperHtml(variables.vendeur),
      boutique: echapperHtml(variables.boutique),
      resume: echapperHtml(variables.resume)
    };
    const message = remplacer(parametres.relance_email_message, variablesHtml);
    const paragraphes = message
      .split(/\n{2,}/)
      .map((bloc) => bloc.trim())
      .filter((bloc) => bloc.length > 0)
      .map((bloc) => bloc.replace(/\n/g, '<br>'));
    const objet = remplacer(parametres.relance_email_objet, variables).replace(/[\r\n]+/g, ' ').trim();
    const { html, text } = vendeurRelanceBoostsTemplate({
      paragraphes,
      lignes: boosts.map((b) => ({
        label: echapperHtml(b.nom || `Boost #${b.id}`),
        value: `${LIBELLES_STATUT_BOOST[b.statut] ?? b.statut} · ${formaterFcfa(b.total_fcfa)}`
      })),
      ctaUrl: cta,
      lienDesinscription: lienPage
    });
    const simule = !process.env.RESEND_API_KEY;
    try {
      await EmailService.envoyerRelanceBoosts(ligne.vendeur_email, objet, html, text, {
        'List-Unsubscribe': `<${lienOneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      });
      return simule ? 'simule' : 'ok';
    } catch (err) {
      logger.error(`[BoostRelance] E-mail ${ligne.boutique_slug}:`, (err as Error)?.message ?? err);
      return 'echec';
    }
  }
}
