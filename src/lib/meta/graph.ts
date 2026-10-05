/**
 * Client minimal Graph API Meta (Marketing API).
 * Port de boost_meta/src/lib/meta/graph.ts :
 * - POST en application/x-www-form-urlencoded (objets JSON sérialisés) ;
 * - une écriture réussit si la réponse contient `id` OU `success: true`
 *   (ex. `POST /{campaign-id}` pour passer en ACTIVE ne renvoie pas d'id) ;
 * - message d'erreur lisible (`error_user_msg` prioritaire).
 */

export function graphUrl(path: string, version: string): string {
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
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

/** POST Graph : renvoie l'`id` créé (undefined pour une mise à jour `{ success: true }`). */
export async function metaGraphPost(
  path: string,
  body: Record<string, unknown>,
  token: string,
  version: string
): Promise<string | undefined> {
  const res = await fetch(graphUrl(path, version), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeGraphBody({ ...body, access_token: token }).toString()
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
  version: string
): Promise<T> {
  const url = new URL(graphUrl(path, version));
  for (const [key, value] of encodeGraphBody(params)) url.searchParams.set(key, value);
  url.searchParams.set('access_token', token);
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
