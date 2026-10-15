import { sanitizeTemplateParam, TemplateComponent } from './whatsapp-templates';

/**
 * Template Meta `boost_en_ligne_vendeur` (catégorie Utility, transactionnel) : envoyé au vendeur quand
 * Meta a accepté sa publicité. À créer et faire approuver depuis le back-office (/whatsapp/templates,
 * seeder BoostEnLigneWhatsappTemplateSeeder) ; tant qu'il n'est pas approuvé, l'envoi échoue sans
 * bloquer l'e-mail ni Telegram.
 * Corps : {{1}} vendeur, {{2}} titre de la pub, {{3}} date de fin ; bouton URL `…/admin/{{1}}`.
 */
export const TEMPLATE_BOOST_EN_LIGNE = { name: 'boost_en_ligne_vendeur', language: 'fr' } as const;

export function buildBoostEnLigneComponents(data: {
  vendeur: string;
  titre: string;
  dateFin: string;
  slug: string;
  boostId: number;
}): TemplateComponent[] {
  return [
    {
      type: 'body',
      parameters: [data.vendeur, data.titre, data.dateFin].map((v) => ({ type: 'text' as const, text: sanitizeTemplateParam(v) }))
    },
    {
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: sanitizeTemplateParam(`${data.slug}/boost/${data.boostId}`) }]
    }
  ];
}
