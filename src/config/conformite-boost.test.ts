import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estConformiteComplete, IDS_CONFORMITE } from './conformite-boost.config';

test('checklist complète uniquement si tout est coché', () => {
  assert.equal(estConformiteComplete(IDS_CONFORMITE), true);
  assert.equal(estConformiteComplete(IDS_CONFORMITE.slice(1)), false);
  assert.equal(estConformiteComplete([]), false);
});
