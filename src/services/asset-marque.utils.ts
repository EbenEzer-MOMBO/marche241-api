/** Décode les entités numériques et les entités nommées utiles pour masquer un schéma d'URL. */
function caractere(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
}

function decoderEntites(texte: string): string {
  return texte
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => caractere(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => caractere(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n');
}

/** Constructions refusées dans un SVG (contrôlées après décodage des entités et retrait des blancs). */
const MOTIFS_INTERDITS: RegExp[] = [
  /<\s*(script|foreignobject|iframe|embed|object|handler|listener)\b/i,
  /<!(doctype|entity)/i,
  /attributename\s*=\s*["']?\s*(on|href|xlink:href)/i,
  /@import/i,
];

/** Schémas d'URL interdits dans les valeurs d'attributs et les feuilles de style, blancs retirés (« java&#9;script: »). */
const SCHEMAS_INTERDITS: RegExp[] = [
  /(javascript|vbscript|livescript):/i,
  /data:(?!image\/(png|jpe?g|gif|webp);base64,)/i,
];

/** Gestionnaire d'événement dans une balise, précédé d'un blanc, d'un guillemet ou d'un « / » (`<svg/onload=…>`). */
const GESTIONNAIRE = /[\s"'/]on[a-z]+\s*=/i;

/**
 * Vérifie qu'un SVG ne contient aucune construction exécutable.
 * Le SVG est refusé plutôt que nettoyé : un logo exporté proprement n'en contient jamais.
 * Retourne le SVG (sans BOM) s'il est sûr, sinon null.
 */
export function nettoyerSvg(source: string): string | null {
  const texte = source.replace(/^\uFEFF/, '');
  if (!/<svg[\s>]/i.test(texte)) {
    return null;
  }
  const decode = decoderEntites(texte);
  if (MOTIFS_INTERDITS.some((motif) => motif.test(decode))) {
    return null;
  }
  // Seuls les balises, les valeurs d'attributs et les feuilles de style sont contrôlés : le texte affiché reste libre
  const balises = decode.match(/<[^>]*>/g) ?? [];
  if (balises.some((balise) => GESTIONNAIRE.test(balise))) {
    return null;
  }
  const valeurs = balises.flatMap((balise) =>
    [...balise.matchAll(/=\s*("[^"]*"|'[^']*'|[^\s>]+)/g)].map((m) => m[1])
  );
  const styles = [...decode.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const aControler = [...valeurs, ...styles].map((valeur) => valeur.replace(/[\u0000- ]+/g, ''));
  if (aControler.some((valeur) => SCHEMAS_INTERDITS.some((motif) => motif.test(valeur)))) {
    return null;
  }
  return texte;
}

export function lireViewBox(svg: string): { largeur: number | null; hauteur: number | null } {
  const viewBox = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBox) {
    const parties = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parties.length === 4 && parties.every((n) => Number.isFinite(n))) {
      return { largeur: Math.round(parties[2]), hauteur: Math.round(parties[3]) };
    }
  }
  const largeur = svg.match(/\bwidth\s*=\s*["'](\d+)/i);
  const hauteur = svg.match(/\bheight\s*=\s*["'](\d+)/i);
  return {
    largeur: largeur ? Number(largeur[1]) : null,
    hauteur: hauteur ? Number(hauteur[1]) : null,
  };
}

/**
 * Dimensions d'un PNG, JPEG, WebP ou ICO sans dépendance native.
 * Retourne des valeurs nulles si la signature ne correspond pas au type annoncé.
 */
export function lireDimensionsRaster(buffer: Buffer, mime: string): { largeur: number | null; hauteur: number | null } {
  if (mime === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { largeur: buffer.readUInt32BE(16), hauteur: buffer.readUInt32BE(20) };
  }
  if ((mime === 'image/jpeg' || mime === 'image/jpg') && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        break;
      }
      const marqueur = buffer[offset + 1];
      const taille = buffer.readUInt16BE(offset + 2);
      // SOF0..SOF15 hors DHT (C4), JPG (C8) et DAC (CC)
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
        return { largeur: buffer.readUInt16BE(offset + 7), hauteur: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + taille;
    }
  }
  if (mime === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8X') {
      return { largeur: 1 + buffer.readUIntLE(24, 3), hauteur: 1 + buffer.readUIntLE(27, 3) };
    }
    if (format === 'VP8 ') {
      return { largeur: buffer.readUInt16LE(26) & 0x3fff, hauteur: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (format === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { largeur: (bits & 0x3fff) + 1, hauteur: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if ((mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') && buffer.length >= 8 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1) {
    return { largeur: buffer[6] === 0 ? 256 : buffer[6], hauteur: buffer[7] === 0 ? 256 : buffer[7] };
  }
  return { largeur: null, hauteur: null };
}
