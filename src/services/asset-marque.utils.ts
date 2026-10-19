/**
 * Retire les constructions dangereuses d'un SVG.
 * Retourne null si le document n'est plus un SVG après nettoyage.
 */
export function nettoyerSvg(source: string): string | null {
  let texte = source.replace(/^\uFEFF/, '');
  texte = texte.replace(/<script[\s\S]*?<\/script>/gi, '');
  texte = texte.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  texte = texte.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  texte = texte.replace(/\s(?:href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
  texte = texte.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  if (/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(texte)) {
    return null;
  }
  if (!/<svg[\s>]/i.test(texte)) {
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

function lireUInt32BE(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

/** Dimensions d'un PNG, JPEG, WebP ou ICO sans dépendance native. */
export function lireDimensionsRaster(buffer: Buffer, mime: string): { largeur: number | null; hauteur: number | null } {
  if (mime === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { largeur: lireUInt32BE(buffer, 16), hauteur: lireUInt32BE(buffer, 20) };
  }
  if ((mime === 'image/jpeg' || mime === 'image/jpg') && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        break;
      }
      const marqueur = buffer[offset + 1];
      const taille = buffer.readUInt16BE(offset + 2);
      if (marqueur >= 0xc0 && marqueur <= 0xc3) {
        return { largeur: buffer.readUInt16BE(offset + 7), hauteur: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + taille;
    }
  }
  if (mime === 'image/webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8X' && buffer.length >= 30) {
      const largeur = 1 + buffer.readUIntLE(24, 3);
      const hauteur = 1 + buffer.readUIntLE(27, 3);
      return { largeur, hauteur };
    }
    if (format === 'VP8 ' && buffer.length >= 30) {
      return { largeur: buffer.readUInt16LE(26) & 0x3fff, hauteur: buffer.readUInt16LE(28) & 0x3fff };
    }
  }
  if ((mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') && buffer.length >= 8 && buffer.readUInt16LE(0) === 0) {
    const largeur = buffer[6] === 0 ? 256 : buffer[6];
    const hauteur = buffer[7] === 0 ? 256 : buffer[7];
    return { largeur, hauteur };
  }
  return { largeur: null, hauteur: null };
}
