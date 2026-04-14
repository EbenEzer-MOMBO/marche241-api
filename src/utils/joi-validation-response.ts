import type { ValidationErrorItem } from 'joi';

export interface FormattedValidationError {
  field: string;
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

const JOI_TYPE_TO_CODE: Record<string, string> = {
  'any.required': 'FIELD_REQUIRED',
  'any.only': 'ANY_ONLY',
  'string.max': 'STRING_MAX_LENGTH',
  'string.min': 'STRING_MIN_LENGTH',
  'string.email': 'STRING_EMAIL',
  'string.uri': 'STRING_URI',
  'string.pattern.base': 'STRING_PATTERN',
  'string.empty': 'STRING_EMPTY',
  'string.base': 'STRING_INVALID',
  'number.min': 'NUMBER_MIN',
  'number.max': 'NUMBER_MAX',
  'number.integer': 'NUMBER_INTEGER',
  'number.base': 'NUMBER_INVALID',
  'object.base': 'OBJECT_INVALID',
  'object.unknown': 'OBJECT_UNKNOWN_KEY',
  'array.base': 'ARRAY_INVALID',
  'array.min': 'ARRAY_MIN_LENGTH',
  'array.max': 'ARRAY_MAX_LENGTH',
  'boolean.base': 'BOOLEAN_INVALID',
  'alternatives.match': 'ALTERNATIVES_NO_MATCH',
};

const MAX_ROOT_MESSAGE_LENGTH = 800;

function joiTypeToStableCode(type: string): string {
  return JOI_TYPE_TO_CODE[type] ?? type.replace(/\./g, '_').toUpperCase();
}

function buildMeta(detail: ValidationErrorItem): Record<string, unknown> | undefined {
  const ctx = detail.context;
  if (!ctx || typeof ctx !== 'object') return undefined;

  const meta: Record<string, unknown> = {};
  const t = detail.type;

  if (t === 'string.max' || t === 'string.min') {
    if (typeof ctx.value === 'string') meta.length = ctx.value.length;
    if (ctx.limit !== undefined) meta.limit = ctx.limit;
  } else if (t === 'number.min' || t === 'number.max') {
    if (typeof ctx.value === 'number') meta.value = ctx.value;
    if (ctx.limit !== undefined) meta.limit = ctx.limit;
  } else if (t === 'array.min' || t === 'array.max') {
    if (Array.isArray(ctx.value)) meta.length = ctx.value.length;
    if (ctx.limit !== undefined) meta.limit = ctx.limit;
  } else if (t === 'any.only' && Array.isArray(ctx.valids)) {
    meta.allowed = ctx.valids;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

function enrichMessage(detail: ValidationErrorItem): string {
  const base = detail.message.replace(/\s+$/, '');
  const ctx = detail.context;
  const t = detail.type;

  if (t === 'string.max' && typeof ctx?.value === 'string' && ctx.limit != null) {
    return `${base.replace(/\.$/, '')} (longueur actuelle : ${ctx.value.length}, maximum : ${ctx.limit}).`;
  }
  if (t === 'string.min' && typeof ctx?.value === 'string' && ctx.limit != null) {
    return `${base.replace(/\.$/, '')} (longueur actuelle : ${ctx.value.length}, minimum : ${ctx.limit}).`;
  }
  if (t === 'number.min' && typeof ctx?.value === 'number' && ctx.limit != null) {
    return `${base.replace(/\.$/, '')} (valeur reçue : ${ctx.value}, minimum : ${ctx.limit}).`;
  }
  if (t === 'number.max' && typeof ctx?.value === 'number' && ctx.limit != null) {
    return `${base.replace(/\.$/, '')} (valeur reçue : ${ctx.value}, maximum : ${ctx.limit}).`;
  }
  if ((t === 'array.min' || t === 'array.max') && Array.isArray(ctx?.value) && ctx.limit != null) {
    return `${base.replace(/\.$/, '')} (nombre d’éléments : ${ctx.value.length}, limite : ${ctx.limit}).`;
  }

  return base.endsWith('.') ? base : `${base}.`;
}

/**
 * Transforme les détails Joi en objets stables pour la réponse API (sans contexte brut).
 */
export function formatJoiDetails(details: ValidationErrorItem[]): FormattedValidationError[] {
  return details.map((detail) => {
    const field = detail.path.length > 0 ? detail.path.join('.') : (detail.context as { key?: string })?.key ?? '';
    return {
      field,
      code: joiTypeToStableCode(detail.type),
      message: enrichMessage(detail),
      meta: buildMeta(detail),
    };
  });
}

/**
 * Message racine lisible pour les clients qui n’exploitent pas le tableau `errors`.
 */
export function buildValidationSummaryMessage(
  items: FormattedValidationError[],
  introLabel: string
): string {
  if (items.length === 0) return introLabel;

  if (items.length === 1) {
    const e = items[0];
    return `${introLabel} : ${e.field} — ${e.message}`;
  }

  const shown = items.slice(0, 5);
  const parts = shown.map((e) => `${e.field}: ${e.message}`);
  let msg = `${introLabel} (${items.length} erreurs) : ${parts.join(' ; ')}`;
  if (items.length > 5) msg += ` ; … et ${items.length - 5} autre(s)`;

  if (msg.length > MAX_ROOT_MESSAGE_LENGTH) {
    return `${msg.slice(0, MAX_ROOT_MESSAGE_LENGTH - 1)}…`;
  }
  return msg;
}
