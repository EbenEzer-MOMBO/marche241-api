import { logger } from '../utils/logger';

export interface HtmlToPdfBilletPayload {
  evenement: {
    nom: string;
    date?: string;
    lieu?: string;
    adresse?: string;
  };
  billets: Array<{ type_billet: string; numero: number }>;
}

export class HtmlToPdfService {
  static isConfigured(): boolean {
    return Boolean(process.env.HTMLTOPDF_URL && process.env.HTMLTOPDF_API_KEY);
  }

  static async generateBilletsPdf(payload: HtmlToPdfBilletPayload): Promise<Buffer> {
    const baseUrl = (process.env.HTMLTOPDF_URL || '')
      .replace(/\/$/, '')
      .replace(/\/v1\/marche241\/billets$/i, '')
      .replace(/\/v1\/pdf$/i, '');
    const apiKey = process.env.HTMLTOPDF_API_KEY || '';

    if (!baseUrl || !apiKey) {
      throw new Error('HTMLTOPDF_URL et HTMLTOPDF_API_KEY doivent être configurés');
    }

    const url = `${baseUrl}/v1/marche241/billets`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.error(`[HtmlToPdfService] Échec ${response.status}: ${detail}`);
      throw new Error('Génération du PDF des billets échouée');
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
