import { supabaseAdmin } from '../config/supabase';

export interface PolitiqueConfidentialite {
  id: number;
  contenu: string;
  date_creation?: string;
  date_modification?: string;
}

export class PolitiqueModel {
  /**
   * Récupère la politique de confidentialité publique (id = 1)
   */
  static async getPolitique(): Promise<PolitiqueConfidentialite | null> {
    const { data, error } = await supabaseAdmin
      .from('politique_confidentialite')
      .select('id, contenu, date_creation, date_modification')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erreur lors de la récupération de la politique de confidentialité: ${error.message}`
      );
    }

    return data;
  }
}
