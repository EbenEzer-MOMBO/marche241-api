import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detecterAppareil, detecterSource, estRobot } from './view-tracking';

test('estRobot exclut les clients non navigateurs', () => {
  assert.equal(estRobot(undefined), true);
  assert.equal(estRobot(''), true);
  assert.equal(estRobot('node'), true);
  assert.equal(estRobot('curl/8.0'), true);
  assert.equal(estRobot('axios/1.6'), true);
  assert.equal(estRobot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(estRobot('WhatsApp/2.23'), true);
  assert.equal(estRobot('Mozilla/5.0 (Linux; Android 14)'), false);
});

test('detecterAppareil', () => {
  assert.equal(detecterAppareil('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(detecterAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(detecterAppareil('Mozilla/5.0 (Windows NT 10.0; Win64)'), 'desktop');
  assert.equal(detecterAppareil('quelque-chose'), 'autre');
});

test('detecterSource privilégie utm_source', () => {
  assert.equal(detecterSource('https://google.com', 'whatsapp'), 'whatsapp');
  assert.equal(detecterSource('https://google.com', 'newsletter'), 'autre');
  assert.equal(detecterSource('', undefined), 'direct');
  assert.equal(detecterSource('https://marche241.com/accueil', undefined), 'interne');
  assert.equal(detecterSource('https://l.facebook.com/l.php', undefined), 'facebook');
  assert.equal(detecterSource('https://exemple.test', undefined), 'autre');
});
