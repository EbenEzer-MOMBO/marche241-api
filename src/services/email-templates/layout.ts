const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const MONO = "'Courier New', Courier, monospace";

export const BRAND = {
  green: '#508e27',
  teal: '#74adaf',
  ink: '#111827',
  gray: '#4b5563',
  grayLight: '#6b7280',
  border: '#e5e7eb',
  bg: '#e8e9e7',
};

export interface EmailBadge {
  label: string;
  background: string;
  color: string;
}

/** Espaceur vertical de `height` px, identique au design (table vide, line-height/font-size à 0). */
export function spacer(height: number): string {
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td height="${height}" style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr></table></td></tr>`;
}

export function badge({ label, background, color }: EmailBadge): string {
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${background}" style="background-color:${background};border-radius:99px;padding:7px 14px;mso-line-height-rule:exactly;line-height:14px;"><span style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${color};">${label}</span></td></tr></table></td></tr>`;
}

export function heading(text: string): string {
  return `<tr><td class="pad" style="padding:0 40px;"><h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:32px;font-weight:bold;color:${BRAND.ink};mso-line-height-rule:exactly;">${text}</h1></td></tr>`;
}

export function paragraph(html: string): string {
  return `<tr><td class="pad" style="padding:0 40px;"><p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.gray};mso-line-height-rule:exactly;">${html}</p></td></tr>`;
}

export function smallParagraph(html: string): string {
  return `<tr><td class="pad" style="padding:0 40px;"><p style="margin:0;font-family:${FONT};font-size:15px;line-height:26px;color:${BRAND.gray};mso-line-height-rule:exactly;">${html}</p></td></tr>`;
}

export function note(html: string): string {
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td bgcolor="#f7f8f7" style="background-color:#f7f8f7;border-left:3px solid ${BRAND.teal};border-radius:4px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND.gray};mso-line-height-rule:exactly;">${html}</td></tr></table></td></tr>`;
}

export function codeBlock(code: string): string {
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="#f3f5f2" style="background-color:#f3f5f2;border:1px dashed ${BRAND.green};border-radius:12px;padding:22px 16px;mso-line-height-rule:exactly;line-height:42px;">\n<span style="font-family:${MONO};font-size:38px;font-weight:bold;letter-spacing:10px;color:${BRAND.ink};">${code}</span></td></tr></table></td></tr>`;
}

export function ctaButton(href: string, label: string, variant: 'primary' | 'secondary' = 'primary'): string {
  if (variant === 'secondary') {
    return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="#ffffff" style="border-radius:12px;background-color:#ffffff;border:1px solid ${BRAND.border};padding:16px 28px;mso-line-height-rule:exactly;line-height:20px;">\n<a href="${href}" style="display:block;font-family:${FONT};font-size:17px;font-weight:bold;color:${BRAND.ink};text-decoration:none;">${label}</a></td></tr></table></td></tr>`;
  }
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="${BRAND.green}" style="border-radius:12px;background-color:${BRAND.green};background-image:linear-gradient(90deg,${BRAND.green},${BRAND.teal});border:1px solid ${BRAND.green};padding:16px 28px;mso-line-height-rule:exactly;line-height:20px;">\n<a href="${href}" style="display:block;font-family:${FONT};font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table></td></tr>`;
}

export interface InfoRow {
  label: string;
  value: string;
}

export function infoTable(rows: InfoRow[]): string {
  const rowsHtml = rows
    .map(
      (row, index) =>
        `<tr><td style="padding:14px 18px;${index > 0 ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:14px;color:${BRAND.grayLight};" width="46%">${row.label}</td><td align="right" style="padding:14px 18px;${index > 0 ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:14px;font-weight:bold;color:${BRAND.ink};">${row.value}</td></tr>`
    )
    .join('');
  return `<tr><td class="pad" style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid ${BRAND.border};border-radius:12px;">\n${rowsHtml}</table></td></tr>`;
}

export interface EmailLayoutOptions {
  preheader: string;
  kicker: string;
  contentRows: string;
  unsubscribe?: boolean;
}

function mailLogoUrl(): string {
  const base = (process.env.APP_URL || 'https://marche241-api.onrender.com').replace(/\/$/, '');
  return `${base}/images/site-logo-mail.png`;
}

/**
 * Enveloppe commune (header logo, carte blanche, footer) reprise du design
 * "Emails transactionnels Marché241". `contentRows` fournit les <tr> entre le
 * bandeau dégradé du haut et l'espaceur de fermeture de la carte.
 */
export function renderEmailLayout({ preheader, kicker, contentRows, unsubscribe = false }: EmailLayoutOptions): string {
  const footerLinks = unsubscribe
    ? `<a href="https://marche241.ga/preferences" style="color:${BRAND.grayLight};text-decoration:underline;">Gérer mes notifications</a> · <a href="https://marche241.ga/desinscription" style="color:${BRAND.grayLight};text-decoration:underline;">Se désinscrire</a>`
    : `Message automatique lié à votre compte vendeur. Vous ne pouvez pas vous désinscrire des emails de sécurité.`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:22px !important;padding-right:22px !important;}
    .h1{font-size:23px !important;line-height:29px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
<span style="display:none;font-size:1px;color:${BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.bg};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px;max-width:600px;">

<tr><td bgcolor="#000000" style="padding:14px 16px;background-color:#000000;border-radius:12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
    <td style="vertical-align:middle;">
      <img src="${mailLogoUrl()}" alt="Marché 241" width="200" style="display:block;border:0;outline:none;text-decoration:none;width:200px;max-width:200px;height:auto;" />
    </td>
    <td align="right" style="vertical-align:middle;padding-left:12px;font-family:${MONO};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">${kicker}</td>
  </tr></table>
</td></tr>

<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
    <tr><td height="6" bgcolor="${BRAND.green}" style="height:6px;line-height:6px;font-size:0;background-color:${BRAND.green};background-image:linear-gradient(90deg,${BRAND.green},${BRAND.teal});border-radius:16px 16px 0 0;">&nbsp;</td></tr>
    ${spacer(34)}
    ${contentRows}
    ${spacer(34)}
  </table>
</td></tr>

<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:20px;color:${BRAND.grayLight};">
  Marché241 · Libreville, Gabon · <a href="https://marche241.ga" style="color:${BRAND.green};text-decoration:none;">marche241.ga</a><br>
  Besoin d'aide ? Écrivez à <a href="mailto:support@marche241.ga" style="color:${BRAND.green};text-decoration:none;">support@marche241.ga</a><br>${footerLinks}
</td></tr>

</table></td></tr></table>
</body>
</html>`;
}
