import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estMediaReference } from '../models/asset-marque.model';
import { affectationSchema, cleEmplacementParamSchema, listeMediasQuerySchema, mediaIdParamSchema } from './validation.schemas.asset-marque';

describe('estMediaReference', () => {
  it('reconnaît les violations de FK RESTRICT', () => {
    assert.equal(estMediaReference({ code: '23001' }), true);
    assert.equal(estMediaReference({ code: '23503' }), true);
    assert.equal(estMediaReference({ code: '42P01' }), false);
    assert.equal(estMediaReference(null), false);
  });
});

describe('schémas des assets de marque', () => {
  it('exige media_id (null autorisé)', () => {
    assert.ok(affectationSchema.validate({}).error);
    assert.equal(affectationSchema.validate({ media_id: null }).error, undefined);
    assert.ok(affectationSchema.validate({ media_id: 'x' }).error);
  });

  it('refuse un emplacement inconnu et un id non numérique', () => {
    assert.ok(cleEmplacementParamSchema.validate({ cle: 'inconnu' }).error);
    assert.equal(cleEmplacementParamSchema.validate({ cle: 'logo_icone' }).error, undefined);
    assert.ok(mediaIdParamSchema.validate({ id: 'abc' }).error);
  });

  it('borne la limite et accepte les filtres vides', () => {
    assert.ok(listeMediasQuerySchema.validate({ limite: 500 }).error);
    const { value, error } = listeMediasQuerySchema.validate({ recherche: '', type: '' });
    assert.equal(error, undefined);
    assert.equal(value.limite, 24);
  });
});

describe('filtre formats', () => {
  it('accepte une liste de types MIME et refuse le reste', () => {
    assert.equal(listeMediasQuerySchema.validate({ formats: 'image/svg+xml,image/png' }).error, undefined);
    assert.ok(listeMediasQuerySchema.validate({ formats: 'image/png;drop' }).error);
  });
});
