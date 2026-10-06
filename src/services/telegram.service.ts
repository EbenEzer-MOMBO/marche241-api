import { evenementParCode, EvenementNotification } from '../config/notifications.config';
import { ConfigNotificationsTelegram, NotificationsTelegramModel } from '../models/notifications-telegram.model';
import { logger } from '../utils/logger';

/**
 * Notifications de l'équipe Marché 241 sur un canal Telegram (Bot API).
 * - Jeton du bot : environnement de l'API uniquement (TELEGRAM_BOT_TOKEN).
 * - Canal, interrupteur et événements : table notifications_telegram, réglés depuis le back-office.
 * - `notifier()` ne fait jamais échouer le flux métier : erreurs journalisées et tracées en base.
 */

const API_TELEGRAM = 'https://api.telegram.org';
const DUREE_CACHE_MS = 60_000;

export class TelegramErreur extends Error {
  constructor(message: string, public readonly statusHttp = 502, public readonly code = 'TELEGRAM_ERREUR') {
    super(message);
    this.name = 'TelegramErreur';
  }
}

export interface ContenuNotification {
  titre: string;
  lignes?: Array<string | null | undefined | false>;
  /** Chemin dans le back-office (ex. « /boosts/42 »), préfixé par ADMIN_URL. */
  lien?: string;
}

const jeton = (): string => process.env.TELEGRAM_BOT_TOKEN || '';

export function lienBackOffice(chemin: string): string | null {
  const base = (process.env.ADMIN_URL || '').replace(/\/$/, '');
  return base ? `${base}${chemin.startsWith('/') ? chemin : `/${chemin}`}` : null;
}

export function echapperHtml(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Message HTML Telegram : emoji + titre en gras, lignes de détail, lien vers le back-office. */
export function formaterMessage(evenement: string, contenu: ContenuNotification): string {
  const emoji = evenementParCode(evenement)?.emoji ?? '🔔';
  const lignes = (contenu.lignes ?? []).filter((l): l is string => typeof l === 'string' && l.trim() !== '');
  const lien = contenu.lien ? lienBackOffice(contenu.lien) : null;
  return [
    `${emoji} <b>${echapperHtml(contenu.titre)}</b>`,
    ...lignes.map(echapperHtml),
    lien ? `<a href="${echapperHtml(lien)}">Ouvrir dans le back-office</a>` : null
  ]
    .filter(Boolean)
    .join('\n');
}

async function appelTelegram<T>(methode: string, corps: Record<string, unknown>): Promise<T> {
  const token = jeton();
  if (!token) throw new TelegramErreur("Renseignez TELEGRAM_BOT_TOKEN dans l'environnement de l'API", 409, 'TELEGRAM_JETON_MANQUANT');
  let res: Response;
  try {
    res = await fetch(`${API_TELEGRAM}/bot${token}/${methode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
  } catch (err: any) {
    throw new TelegramErreur(`Telegram injoignable : ${err?.message ?? 'erreur réseau'}`);
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) {
    throw new TelegramErreur(traduireErreur(json.description ?? `HTTP ${res.status}`), res.status === 401 ? 409 : 502);
  }
  return json.result as T;
}

/** Messages d'erreur Telegram courants, en français. */
export function traduireErreur(description: string): string {
  if (/unauthorized/i.test(description)) return 'Jeton du bot refusé par Telegram (TELEGRAM_BOT_TOKEN invalide)';
  if (/chat not found/i.test(description)) return 'Canal introuvable : vérifiez son nom (@canal) ou son identifiant';
  if (/not enough rights|need administrator|not a member|bot was kicked|have no rights/i.test(description)) {
    return 'Le bot doit être ajouté en administrateur du canal, avec le droit de publier';
  }
  return `Telegram : ${description}`;
}

// ---------------------------------------------------------------------------
// Configuration (cache court)
// ---------------------------------------------------------------------------

let cache: { config: ConfigNotificationsTelegram | null; expire: number } | null = null;
let surcharge: ConfigNotificationsTelegram | null | undefined;

/** Tests unitaires : configuration sans base (undefined pour revenir au réel). */
export function definirConfigTelegramPourTests(config: Partial<ConfigNotificationsTelegram> | null | undefined): void {
  surcharge =
    config === undefined || config === null
      ? config
      : {
          chat_id: '@canal_test',
          canal_nom: 'Canal test',
          actif: true,
          evenements: [],
          dernier_envoi_le: null,
          derniere_erreur: null,
          modifie_par: null,
          date_modification: new Date(),
          ...config
        };
  cache = null;
}

export async function chargerConfigTelegram(): Promise<ConfigNotificationsTelegram | null> {
  if (surcharge !== undefined) return surcharge;
  if (cache && cache.expire > Date.now()) return cache.config;
  let config: ConfigNotificationsTelegram | null = null;
  try {
    config = await NotificationsTelegramModel.lire();
  } catch (err: any) {
    logger.warn(`[Telegram] Lecture de notifications_telegram impossible : ${err?.message}`);
  }
  cache = { config, expire: Date.now() + DUREE_CACHE_MS };
  return config;
}

/** Trace du dernier envoi en base (sauf configuration de test). */
async function tracer(erreur: string | null): Promise<void> {
  if (surcharge !== undefined) return;
  await NotificationsTelegramModel.tracerEnvoi(erreur).catch(() => undefined);
}

export function viderCacheTelegram(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export async function envoyerTelegram(chatId: string, texte: string): Promise<void> {
  await appelTelegram('sendMessage', { chat_id: chatId, text: texte, parse_mode: 'HTML', disable_web_page_preview: true });
}

/**
 * Notifie l'équipe si le système est actif et l'événement coché. Ne lève jamais d'erreur :
 * l'appelant peut ignorer la promesse (`void notifier(…)`).
 */
export async function notifier(evenement: EvenementNotification, contenu: ContenuNotification): Promise<boolean> {
  try {
    if (!jeton()) return false;
    const config = await chargerConfigTelegram();
    if (!config?.actif || !config.chat_id || !config.evenements.includes(evenement)) return false;
    await envoyerTelegram(config.chat_id, formaterMessage(evenement, contenu));
    await tracer(null);
    return true;
  } catch (err: any) {
    logger.warn(`[Telegram] Notification ${evenement} non envoyée : ${err?.message}`);
    await tracer(err?.message ?? 'Erreur Telegram');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vérification (back-office)
// ---------------------------------------------------------------------------

export interface VerificationTelegram {
  jeton_present: boolean;
  bot: { username: string; nom: string } | null;
  canal: { id: string; titre: string; type: string } | null;
  erreur: string | null;
}

export async function verifierTelegram(chatId: string | null): Promise<VerificationTelegram> {
  const resultat: VerificationTelegram = { jeton_present: Boolean(jeton()), bot: null, canal: null, erreur: null };
  if (!resultat.jeton_present) {
    resultat.erreur = "Renseignez TELEGRAM_BOT_TOKEN dans l'environnement de l'API";
    return resultat;
  }
  try {
    const moi = await appelTelegram<{ username?: string; first_name?: string }>('getMe', {});
    resultat.bot = { username: moi.username ?? '', nom: moi.first_name ?? moi.username ?? 'Bot' };
    if (chatId) {
      const chat = await appelTelegram<{ id: number | string; title?: string; username?: string; type?: string }>('getChat', { chat_id: chatId });
      resultat.canal = { id: String(chat.id), titre: chat.title ?? chat.username ?? String(chat.id), type: chat.type ?? '' };
    }
  } catch (err: any) {
    resultat.erreur = err?.message ?? 'Erreur Telegram';
  }
  return resultat;
}
