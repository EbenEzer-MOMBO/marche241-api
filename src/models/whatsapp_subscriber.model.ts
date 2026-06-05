import { supabaseAdmin } from '../config/supabase';

export interface WhatsappSubscriber {
  id?: number;
  phone: string;
  name: string | null;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export class WhatsappSubscriberModel {
  private static readonly TABLE_NAME = 'whatsapp_subscribers';

  /**
   * Normalise un numéro de téléphone pour WhatsApp avec le préfixe '+'
   */
  private static normalizePhone(phone: string): string {
    const onlyDigits = phone.trim().replace(/\D/g, '');
    if (onlyDigits === '') {
      return '';
    }
    let digits = onlyDigits;
    if (digits.startsWith('0')) {
      digits = '241' + digits.substring(1);
    }
    if (digits.length <= 9) {
      digits = '241' + digits;
    }
    return '+' + digits;
  }

  /**
   * Enregistre ou met à jour un abonné en statut actif
   * @param phone Numéro de téléphone
   * @param name Nom de l'abonné
   */
  static async subscribe(phone: string, name: string | null = null): Promise<WhatsappSubscriber> {
    const cleanedPhone = this.normalizePhone(phone);

    if (!cleanedPhone) {
      throw new Error('Le numéro de téléphone ne peut pas être vide ou invalide');
    }

    // Rechercher si l'abonné existe déjà
    const { data: existing, error: getError } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('phone', cleanedPhone)
      .maybeSingle();

    if (getError) {
      console.error(`[WhatsappSubscriberModel] Erreur lors de la recherche de l'abonné ${cleanedPhone}:`, getError.message);
      throw new Error(`Erreur lors de la recherche de l'abonné: ${getError.message}`);
    }

    if (existing) {
      // Si l'abonné existe déjà, mettre à jour son statut à "active"
      const updateData: Partial<WhatsappSubscriber> = {
        status: 'active',
        updated_at: new Date().toISOString()
      };
      
      // Mettre à jour le nom si fourni
      if (name) {
        updateData.name = name;
      }

      console.log(`[WhatsappSubscriberModel] Mise à jour de l'abonné existant (ID: ${existing.id}, Phone: ${cleanedPhone})`);
      const { data: updated, error: updateError } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error(`[WhatsappSubscriberModel] Erreur lors de la mise à jour de l'abonné ${cleanedPhone}:`, updateError.message);
        throw new Error(`Erreur lors de la mise à jour de l'abonné: ${updateError.message}`);
      }

      return updated as WhatsappSubscriber;
    } else {
      // Créer un nouvel abonné actif
      const insertData = {
        phone: cleanedPhone,
        name: name || null,
        status: 'active' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log(`[WhatsappSubscriberModel] Création d'un nouvel abonné (Phone: ${cleanedPhone})`);
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error(`[WhatsappSubscriberModel] Erreur lors de l'insertion de l'abonné ${cleanedPhone}:`, insertError.message);
        throw new Error(`Erreur lors de la création de l'abonné: ${insertError.message}`);
      }

      return inserted as WhatsappSubscriber;
    }
  }

  /**
   * Désabonne un utilisateur (bascule le statut à inactive)
   * @param phone Numéro de téléphone
   */
  static async unsubscribe(phone: string): Promise<WhatsappSubscriber | null> {
    const cleanedPhone = this.normalizePhone(phone);

    if (!cleanedPhone) {
      throw new Error('Le numéro de téléphone ne peut pas être vide ou invalide');
    }

    // Rechercher si l'abonné existe
    const { data: existing, error: getError } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('phone', cleanedPhone)
      .maybeSingle();

    if (getError) {
      console.error(`[WhatsappSubscriberModel] Erreur lors de la recherche pour désabonnement ${cleanedPhone}:`, getError.message);
      throw new Error(`Erreur lors de la recherche de l'abonné: ${getError.message}`);
    }

    if (!existing) {
      console.log(`[WhatsappSubscriberModel] Aucun abonné trouvé pour le numéro ${cleanedPhone} pour désabonnement`);
      return null;
    }

    console.log(`[WhatsappSubscriberModel] Passage du statut à inactive pour l'abonné (ID: ${existing.id}, Phone: ${cleanedPhone})`);
    const { data: updated, error: updateError } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      console.error(`[WhatsappSubscriberModel] Erreur lors du désabonnement de l'abonné ${cleanedPhone}:`, updateError.message);
      throw new Error(`Erreur lors du désabonnement: ${updateError.message}`);
    }

    return updated as WhatsappSubscriber;
  }

  /**
   * Désabonne un utilisateur à partir de son ID
   * @param id Identifiant de l'abonné
   */
  static async unsubscribeById(id: number): Promise<WhatsappSubscriber | null> {
    if (!id || isNaN(id)) {
      throw new Error("L'identifiant de l'abonné est invalide");
    }

    // Rechercher si l'abonné existe
    const { data: existing, error: getError } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (getError) {
      console.error(`[WhatsappSubscriberModel] Erreur lors de la recherche pour désabonnement ID ${id}:`, getError.message);
      throw new Error(`Erreur lors de la recherche de l'abonné: ${getError.message}`);
    }

    if (!existing) {
      console.log(`[WhatsappSubscriberModel] Aucun abonné trouvé pour l'ID ${id} pour désabonnement`);
      return null;
    }

    console.log(`[WhatsappSubscriberModel] Passage du statut à inactive pour l'abonné (ID: ${id}, Phone: ${existing.phone})`);
    const { data: updated, error: updateError } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`[WhatsappSubscriberModel] Erreur lors du désabonnement de l'abonné ID ${id}:`, updateError.message);
      throw new Error(`Erreur lors du désabonnement: ${updateError.message}`);
    }

    return updated as WhatsappSubscriber;
  }
}

