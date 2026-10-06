import { createHmac } from 'crypto';

/**
 * Client minimal Graph API Meta (Marketing API).
 * Port de boost_meta/src/lib/meta/graph.ts :
 * - POST en application/x-www-form-urlencoded (objets JSON sérialisés) ;
 * - une écriture réussit si la réponse contient `id` OU `success: true`
 *   (ex. `POST /{campaign-id}` pour passer en ACTIVE ne renvoie pas d'id) ;
 * - message d'erreur lisible (`error_user_msg` prioritaire) ;
 * - `appsecret_proof` ajouté quand le secret de l'app est fourni (recommandé par Meta pour un jeton serveur).
 */

/**
 * Version de l'API figée dans le code : les payloads (objectifs OUTCOME_*, advantage_audience,
 * is_adset_budget_sharing_enabled) en dépendent. La monter volontairement, tests à l'appui.
 */
export const META_GRAPH_VERSION = 'v25.0';

export interface OptionsGraph {
  version?: string;
  appSecret?: string;
}

export function graphUrl(path: string, version: string): string {
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
}

/** HMAC-SHA256 du jeton d'accès, clé = secret de l'app (hex). */
export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

export function encodeGraphBody(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
    } else {
      params.set(key, JSON.stringify(value));
    }
  }
  return params;
}

interface GraphErrorBody {
  error?: {
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    code?: number;
  };
}

export function graphErrorMessage(json: unknown, fallback: string): string {
  const err = (json as GraphErrorBody | null)?.error;
  return err?.error_user_msg || err?.message || fallback;
}

export function isGraphWriteSuccess(json: { id?: string; success?: boolean }): boolean {
  return Boolean(json.id) || json.success === true;
}

export class MetaGraphError extends Error {
  constructor(message: string, public readonly path: string, public readonly status?: number) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

function normaliserOptions(options: OptionsGraph | string | undefined): OptionsGraph {
  return typeof options === 'string' ? { version: options } : (options ?? {});
}

function authentification(token: string, options: OptionsGraph): Record<string, string> {
  return options.appSecret
    ? { access_token: token, appsecret_proof: appSecretProof(token, options.appSecret) }
    : { access_token: token };
}

/** POST Graph : renvoie l'`id` créé (undefined pour une mise à jour `{ success: true }`). */
export async function metaGraphPost(
  path: string,
  body: Record<string, unknown>,
  token: string,
  options?: OptionsGraph | string
): Promise<string | undefined> {
  const opts = normaliserOptions(options);
  const res = await fetch(graphUrl(path, opts.version ?? META_GRAPH_VERSION), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeGraphBody({ ...body, ...authentification(token, opts) }).toString()
  });
  let json: { id?: string; success?: boolean } & GraphErrorBody;
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new MetaGraphError(`Erreur Meta POST ${path} (${res.status})`, path, res.status);
  }
  if (!res.ok || json.error || !isGraphWriteSuccess(json)) {
    throw new MetaGraphError(graphErrorMessage(json, `Erreur Meta POST ${path}`), path, res.status);
  }
  return json.id;
}

/** GET Graph : `params` sont ajoutés en query string (objets sérialisés en JSON). */
export async function metaGraphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, unknown>,
  token: string,
  options?: OptionsGraph | string
): Promise<T> {
  const opts = normaliserOptions(options);
  const url = new URL(graphUrl(path, opts.version ?? META_GRAPH_VERSION));
  for (const [key, value] of encodeGraphBody(params)) url.searchParams.set(key, value);
  for (const [key, value] of Object.entries(authentification(token, opts))) url.searchParams.set(key, value);
  const res = await fetch(url);
  let json: T & GraphErrorBody;
  try {
    json = (await res.json()) as T & GraphErrorBody;
  } catch {
    throw new MetaGraphError(`Erreur Meta GET ${path} (${res.status})`, path, res.status);
  }
  if (!res.ok || json.error) {
    throw new MetaGraphError(graphErrorMessage(json, `Erreur Meta GET ${path}`), path, res.status);
  }
  return json;
}
