import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detecterAppareil, detecterSource, estRobot, resoudreLocalisation } from './view-tracking';

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

test('resoudreLocalisation : le fuseau prime sur une IP de VPN', () => {
  assert.deepEqual(
    resoudreLocalisation({ pays: 'FR', ville: 'Roubaix' }, 'Africa/Libreville'),
    { pays: 'GA', ville: null, pays_ip: 'FR', via_vpn: true }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: 'VPN', ville: null }, 'Africa/Libreville'),
    { pays: 'GA', ville: null, pays_ip: 'VPN', via_vpn: true }
  );
});

test('resoudreLocalisation : IP et fuseau cohérents', () => {
  assert.deepEqual(
    resoudreLocalisation({ pays: 'GA', ville: 'Libreville' }, 'Africa/Libreville'),
    { pays: 'GA', ville: 'Libreville', pays_ip: 'GA', via_vpn: false }
  );
});

test('resoudreLocalisation : sans fuseau, retour à l\'IP', () => {
  assert.deepEqual(
    resoudreLocalisation({ pays: 'FR', ville: 'Paris' }, undefined),
    { pays: 'FR', ville: 'Paris', pays_ip: 'FR', via_vpn: false }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: 'VPN', ville: null }, undefined),
    { pays: null, ville: null, pays_ip: 'VPN', via_vpn: true }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: null, ville: null }, 'Asia/Tokyo'),
    { pays: null, ville: null, pays_ip: null, via_vpn: null }
  );
});

test('resoudreLocalisation : Africa/Lagos (PC Windows au Gabon) est ambigu', () => {
  assert.deepEqual(
    resoudreLocalisation({ pays: 'GA', ville: 'Libreville' }, 'Africa/Lagos'),
    { pays: 'GA', ville: 'Libreville', pays_ip: 'GA', via_vpn: false }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: 'FR', ville: 'Roubaix' }, 'Africa/Lagos'),
    { pays: null, ville: null, pays_ip: 'FR', via_vpn: true }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: 'VPN', ville: null }, 'Africa/Lagos'),
    { pays: null, ville: null, pays_ip: 'VPN', via_vpn: true }
  );
  assert.deepEqual(
    resoudreLocalisation({ pays: null, ville: null }, 'Africa/Lagos'),
    { pays: null, ville: null, pays_ip: null, via_vpn: null }
  );
});

test('resoudreLocalisation : fuseau connu, IP non résolue', () => {
  assert.deepEqual(
    resoudreLocalisation({ pays: null, ville: null }, 'Africa/Libreville'),
    { pays: 'GA', ville: null, pays_ip: null, via_vpn: false }
  );
});
