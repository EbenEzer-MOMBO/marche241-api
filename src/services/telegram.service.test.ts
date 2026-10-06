import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  definirConfigTelegramPourTests,
  echapperHtml,
  formaterMessage,
  notifier,
  traduireErreur,
  verifierTelegram
} from './telegram.service';

const ENV = ['TELEGRAM_BOT_TOKEN', 'ADMIN_URL'];
const envInitial: Record<string, string | undefined> = {};
const fetchInitial = globalThis.fetch;
let appels: Array<{ methode: string; corps: Record<string, unknown> }> = [];

function telegramSimule(reponses: Record<string, { ok: boolean; result?: unknown; description?: string }> = {}) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const methode = String(url).split('/').pop() ?? '';
    appels.push({ methode, corps: JSON.parse(String(init?.body ?? '{}')) });
    const rep = reponses[methode] ?? { ok: true, result: { message_id: 1 } };
    return new Response(JSON.stringify(rep), { status: rep.ok ? 200 : 400 });
  }) as typeof fetch;
}

beforeEach(() => {
  for (const k of ENV) envInitial[k] = process.env[k];
  process.env.TELEGRAM_BOT_TOKEN = '123:jeton-test';
  process.env.ADMIN_URL = 'https://admin.marche241.ga/';
  appels = [];
});

afterEach(() => {
  for (const k of ENV) {
    if (envInitial[k] === undefined) delete process.env[k];
    else process.env[k] = envInitial[k];
  }
  definirConfigTelegramPourTests(undefined);
  globalThis.fetch = fetchInitial;
});

test('échappement HTML et format du message (emoji, titre gras, lignes, lien back-office)', () => {
  assert.equal(echapperHtml('<b>A & B</b>'), '&lt;b&gt;A &amp; B&lt;/b&gt;');
  const message = formaterMessage('boost_a_valider', {
    titre: 'Boost <payé>',
    lignes: ['Boutique : Chez Awa & co', null, '', false],
    lien: '/boosts/42'
  });
  assert.equal(
    message,
    '📣 <b>Boost &lt;payé&gt;</b>\nBoutique : Chez Awa &amp; co\n<a href="https://admin.marche241.ga/boosts/42">Ouvrir dans le back-office</a>'
  );
  delete process.env.ADMIN_URL;
  assert.doesNotMatch(formaterMessage('commande_payee', { titre: 'x', lien: '/commandes' }), /href/);
});

test('notifier : envoie uniquement si jeton, système actif, canal et événement coché', async () => {
  telegramSimule();
  definirConfigTelegramPourTests({ actif: true, evenements: ['boost_a_valider'] });
  assert.equal(await notifier('boost_a_valider', { titre: 'Boost payé' }), true);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].methode, 'sendMessage');
  assert.equal(appels[0].corps.chat_id, '@canal_test');
  assert.equal(appels[0].corps.parse_mode, 'HTML');

  assert.equal(await notifier('commande_payee', { titre: 'Commande' }), false, 'événement non coché');
  definirConfigTelegramPourTests({ actif: false, evenements: ['boost_a_valider'] });
  assert.equal(await notifier('boost_a_valider', { titre: 'x' }), false, 'système désactivé');
  definirConfigTelegramPourTests({ actif: true, chat_id: null, evenements: ['boost_a_valider'] });
  assert.equal(await notifier('boost_a_valider', { titre: 'x' }), false, 'sans canal');
  definirConfigTelegramPourTests({ actif: true, evenements: ['boost_a_valider'] });
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(await notifier('boost_a_valider', { titre: 'x' }), false, 'sans jeton');
  assert.equal(appels.length, 1);
});

test('notifier ne lève jamais d’erreur (Telegram en panne)', async () => {
  globalThis.fetch = (async () => {
    throw new Error('réseau coupé');
  }) as typeof fetch;
  definirConfigTelegramPourTests({ actif: true, evenements: ['paiement_echoue'] });
  assert.equal(await notifier('paiement_echoue', { titre: 'x' }), false);
});

test('vérification : bot et canal, erreurs traduites', async () => {
  telegramSimule({
    getMe: { ok: true, result: { username: 'marche241_bot', first_name: 'Marché 241' } },
    getChat: { ok: true, result: { id: -1001234, title: 'Équipe M241', type: 'channel' } }
  });
  const ok = await verifierTelegram('@equipe_m241');
  assert.deepEqual(ok.bot, { username: 'marche241_bot', nom: 'Marché 241' });
  assert.deepEqual(ok.canal, { id: '-1001234', titre: 'Équipe M241', type: 'channel' });
  assert.equal(ok.erreur, null);

  telegramSimule({ getChat: { ok: false, description: 'Bad Request: chat not found' } });
  assert.match((await verifierTelegram('@inconnu')).erreur ?? '', /Canal introuvable/);

  delete process.env.TELEGRAM_BOT_TOKEN;
  const sansJeton = await verifierTelegram('@x');
  assert.equal(sansJeton.jeton_present, false);
  assert.match(sansJeton.erreur ?? '', /TELEGRAM_BOT_TOKEN/);

  assert.match(traduireErreur('Unauthorized'), /Jeton du bot refusé/);
  assert.match(traduireErreur('Forbidden: bot is not a member of the channel chat'), /administrateur du canal/);
});
