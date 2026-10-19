import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lireDimensionsRaster, lireViewBox, nettoyerSvg } from './asset-marque.utils';

describe('nettoyerSvg', () => {
  it('accepte un logo ordinaire', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 20"><defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0"/><use xlink:href="#a"/></svg>';
    assert.equal(nettoyerSvg(svg), svg);
  });

  it('accepte une image matricielle embarquée', () => {
    assert.ok(nettoyerSvg('<svg><image href="data:image/png;base64,iVBORw0KGgo="/></svg>'));
  });

  const dangereux: Array<[string, string]> = [
    ['script', '<svg viewBox="0 0 10 20"><script>alert(1)</script></svg>'],
    ['onload après /', '<svg/onload=alert(1)>'],
    ['onclick', '<svg onclick="alert(1)"><rect /></svg>'],
    ['javascript en entités', '<svg><a href="jav&#x61;script:alert(1)"><rect/></a></svg>'],
    ['javascript avec tabulation', '<svg><a href="java&#9;script:alert(1)"><rect/></a></svg>'],
    ['data svg', '<svg><use href="data:image/svg+xml;base64,PHN2Zz4="/></svg>'],
    ['animation de href', '<svg><animate attributeName="href" values="#a"/></svg>'],
    ['foreignObject', '<svg><foreignObject><div/></foreignObject></svg>'],
    ['entité XML', '<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'],
  ];
  for (const [nom, svg] of dangereux) {
    it(`refuse : ${nom}`, () => {
      assert.equal(nettoyerSvg(svg), null);
    });
  }

  it('refuse un document qui n\'est pas un svg', () => {
    assert.equal(nettoyerSvg('<html><body/></html>'), null);
  });
});

describe('lireViewBox', () => {
  it('lit le viewBox', () => {
    assert.deepEqual(lireViewBox('<svg viewBox="0 0 120 40"></svg>'), { largeur: 120, hauteur: 40 });
  });
});

describe('lireDimensionsRaster', () => {
  it('lit un PNG', () => {
    const png = Buffer.alloc(24);
    png.write('\x89PNG', 0, 'binary');
    png.writeUInt32BE(512, 16);
    png.writeUInt32BE(256, 20);
    assert.deepEqual(lireDimensionsRaster(png, 'image/png'), { largeur: 512, hauteur: 256 });
  });

  it('ne reconnaît pas un faux PNG', () => {
    assert.deepEqual(lireDimensionsRaster(Buffer.from('<html>pas une image</html>'), 'image/png'), { largeur: null, hauteur: null });
  });
});
