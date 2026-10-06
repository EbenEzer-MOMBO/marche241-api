import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideParamSchema, guideStatutSchema } from './validation.schemas.guide';

const message = (schema: { validate: (v: unknown) => { error?: { details: Array<{ message: string }> } } }, v: unknown) =>
  schema.validate(v).error?.details[0]?.message;

test('visite guidée : liste blanche et statut, messages en français', () => {
  assert.equal(message(guideParamSchema, { guide: 'publicite' }), undefined);
  assert.equal(message(guideParamSchema, { guide: 'inconnu' }), 'Visite guidée inconnue');
  assert.equal(message(guideStatutSchema, { statut: 'termine' }), undefined);
  assert.equal(message(guideStatutSchema, { statut: 'ignore' }), undefined);
  assert.equal(message(guideStatutSchema, { statut: 'vu' }), 'Le statut doit être « termine » ou « ignore »');
  assert.equal(message(guideStatutSchema, {}), 'Le statut est obligatoire');
});
