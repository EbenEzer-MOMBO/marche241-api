import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererJetonAvis, hacherJetonAvis, jetonAvisBienForme, hacherIp } from './jeton';
import { filtrerCommentaireAvis, nettoyerTexteAvis } from './filtre';
import { nomAuteurAvis, prenomClient } from './auteur';
import { parserParametresAvis, serialiserParametresAvis, statutInitialAvis, PARAMETRES_AVIS_DEFAUT } from './parametres';

test('jeton : aléatoire, bien formé, empreinte stable', () => {
  const a = genererJetonAvis();
  const b = genererJetonAvis();
  assert.notEqual(a.jeton, b.jeton);
  assert.ok(jetonAvisBienForme(a.jeton));
  assert.equal(a.hash, hacherJetonAvis(a.jeton));
  assert.equal(a.hash.length, 64);
  assert.notEqual(a.hash, a.jeton);
});

test('jeton : formats invalides rejetés', () => {
  assert.equal(jetonAvisBienForme(''), false);
  assert.equal(jetonAvisBienForme('abc'), false);
  assert.equal(jetonAvisBienForme("' OR 1=1 --"), false);
  assert.equal(jetonAvisBienForme(null), false);
  assert.equal(jetonAvisBienForme('a'.repeat(44)), false);
});

test('IP hachée, jamais en clair', () => {
  const h = hacherIp('41.158.1.2');
  assert.ok(h && h.length === 64 && !h.includes('41.158'));
  assert.equal(hacherIp(undefined), null);
});

test('filtre : commentaire propre', () => {
  assert.deepEqual(filtrerCommentaireAvis('Très bon produit, livré rapidement à Akanda. Merci !'), { suspect: false, motifs: [] });
  assert.deepEqual(filtrerCommentaireAvis(''), { suspect: false, motifs: [] });
  assert.deepEqual(filtrerCommentaireAvis(null), { suspect: false, motifs: [] });
  assert.equal(filtrerCommentaireAvis('Taille 42, prix 15000 FCFA, top').suspect, false);
});

test('filtre : liens, e-mails, téléphones', () => {
  assert.deepEqual(filtrerCommentaireAvis('Allez voir https://arnaque.com').motifs, ['lien']);
  assert.deepEqual(filtrerCommentaireAvis('moins cher sur www.concurrent.ga').motifs, ['lien']);
  assert.ok(filtrerCommentaireAvis('écrivez moi: vendeur@gmail.com').motifs.includes('email'));
  assert.deepEqual(filtrerCommentaireAvis('Appelez le 077 12 34 56').motifs, ['telephone']);
  assert.deepEqual(filtrerCommentaireAvis('whatsapp +241 66 12 34 56').motifs, ['telephone']);
  assert.deepEqual(filtrerCommentaireAvis('06.12.34.56').motifs, ['telephone']);
  assert.equal(filtrerCommentaireAvis('Commande COM-2026-050014 reçue en bon état').suspect, false);
  assert.deepEqual(filtrerCommentaireAvis('Commande COM-2026-050014, appelez le 077 12 34 56').motifs, ['telephone']);
});

test('filtre : mots interdits (accents et casse ignorés, mot entier)', () => {
  assert.deepEqual(filtrerCommentaireAvis('Quelle ARNAQUE', ['arnaque']).motifs, ['mot_interdit']);
  assert.deepEqual(filtrerCommentaireAvis('Vendeur escroc', ['éscroc']).motifs, ['mot_interdit']);
  assert.equal(filtrerCommentaireAvis('Classe et classique', ['ass']).suspect, false);
});

test('filtre : majuscules et répétitions', () => {
  assert.ok(filtrerCommentaireAvis('NUL NUL NUL CE PRODUIT EST NUL').motifs.includes('majuscules'));
  assert.ok(filtrerCommentaireAvis('Super!!!!!!!!!!!!').motifs.includes('repetition'));
});

test('nettoyage du texte', () => {
  assert.equal(nettoyerTexteAvis('  <b>Bien</b> reçu  '), 'Bien reçu');
  assert.equal(nettoyerTexteAvis('<script>alert(1)</script>ok'), 'alert(1)ok');
  assert.equal(nettoyerTexteAvis('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
  assert.equal(nettoyerTexteAvis('   '), null);
  assert.equal(nettoyerTexteAvis(undefined), null);
  assert.equal(nettoyerTexteAvis('bon​produit\u0007'), 'bonproduit');
});

test('nom de l\'auteur : « Prénom N. »', () => {
  assert.equal(nomAuteurAvis('aïcha MOUSSAVOU'), 'Aïcha M.');
  assert.equal(nomAuteurAvis('Jean-Pierre Ndong Obame'), 'Jean-Pierre O.');
  assert.equal(nomAuteurAvis('MARIE-CLAIRE nze'), 'Marie-Claire N.');
  assert.equal(nomAuteurAvis('Paul'), 'Paul');
  assert.equal(nomAuteurAvis('  '), 'Client');
  assert.equal(nomAuteurAvis(null), 'Client');
  assert.equal(nomAuteurAvis('Marie 0771234567'), 'Marie');
  assert.equal(prenomClient('aïcha MOUSSAVOU'), 'Aïcha');
});

test('paramètres : parsing avec bornes et défauts', () => {
  const p = parserParametresAvis([
    { cle: 'actif', valeur: 'true' },
    { cle: 'delai_invitation_jours', valeur: '5' },
    { cle: 'validite_jeton_jours', valeur: '0' }, // hors bornes → défaut
    { cle: 'auto_approbation', valeur: 'tout' }, // invalide → défaut
    { cle: 'mots_interdits', valeur: '["arnaque", "", 3]' },
    { cle: 'inconnue', valeur: '1' }
  ]);
  assert.equal(p.actif, true);
  assert.equal(p.delai_invitation_jours, 5);
  assert.equal(p.validite_jeton_jours, PARAMETRES_AVIS_DEFAUT.validite_jeton_jours);
  assert.equal(p.auto_approbation, 'aucune');
  assert.deepEqual(p.mots_interdits, ['arnaque']);
  assert.equal(parserParametresAvis([{ cle: 'mots_interdits', valeur: 'pas du json' }]).mots_interdits.length, 0);
  assert.deepEqual(serialiserParametresAvis({ actif: true, mots_interdits: ['a'] }), [['actif', 'true'], ['mots_interdits', '["a"]']]);
});

test('statut initial : modération par défaut, suspect jamais auto-approuvé', () => {
  assert.equal(statutInitialAvis(5, false, 'aucune'), 'en_attente');
  assert.equal(statutInitialAvis(5, false, 'positifs_sans_texte_suspect'), 'approuve');
  assert.equal(statutInitialAvis(3, false, 'positifs_sans_texte_suspect'), 'en_attente');
  assert.equal(statutInitialAvis(5, true, 'positifs_sans_texte_suspect'), 'en_attente');
});
