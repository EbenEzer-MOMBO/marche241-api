import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lireViewBox, nettoyerSvg } from './asset-marque.utils';

describe('nettoyerSvg', () => {
  it('retire un script et conserve le svg', () => {
    const resultat = nettoyerSvg('<svg viewBox="0 0 10 20"><script>alert(1)</script><path d="M0 0"/></svg>');
    assert.ok(resultat);
    assert.equal(resultat!.includes('<script'), false);
    assert.equal(resultat!.includes('<path'), true);
  });

  it('refuse un document qui n\'est plus un svg', () => {
    assert.equal(nettoyerSvg('<script>alert(1)</script>'), null);
  });

  it('retire un gestionnaire onclick', () => {
    const resultat = nettoyerSvg('<svg onclick="alert(1)"><rect /></svg>');
    assert.ok(resultat);
    assert.equal(/onclick/i.test(resultat!), false);
  });
});

describe('lireViewBox', () => {
  it('lit le viewBox', () => {
    assert.deepEqual(lireViewBox('<svg viewBox="0 0 120 40"></svg>'), { largeur: 120, hauteur: 40 });
  });
});
