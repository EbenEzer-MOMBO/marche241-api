import test from 'node:test';
import assert from 'node:assert/strict';
import { META_TEMPLATES, buildBienvenueVendeurComponents } from './whatsapp-templates';

test('bienvenue vendeur : template et paramètre d\'en-tête (prénom)', () => {
  assert.equal(META_TEMPLATES.bienvenueVendeur.name, 'message_bienvenue_nouveaux_vendeurs');
  assert.equal(META_TEMPLATES.bienvenueVendeur.language, 'fr');
  assert.deepEqual(buildBienvenueVendeurComponents({ prenom: 'Brice' }), [
    { type: 'header', parameters: [{ type: 'text', text: 'Brice' }] },
  ]);
});
