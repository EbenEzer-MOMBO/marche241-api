-- Relances des boosts Meta restés en brouillon ou en attente de paiement.
-- Désinscription vendeur, paramètres éditables depuis le back-office, index du journal.

ALTER TABLE vendeurs ADD COLUMN IF NOT EXISTS relances_boost_desinscrit_le TIMESTAMPTZ NULL;

INSERT INTO boost_parametres (cle, valeur) VALUES
    ('relance_active', 'true'),
    ('relance_whatsapp_active', 'true'),
    ('relance_email_active', 'true'),
    ('relance_delai_initial_heures', '24'),
    ('relance_intervalle_heures', '48'),
    ('relance_max', '2'),
    ('relance_heure_envoi', '10'),
    ('relance_age_max_jours', '30'),
    ('relance_email_objet', '{boutique} : vos boosts vous attendent 🚀'),
    ('relance_email_message', E'Bonjour {vendeur},\n\nVotre boutique {boutique} a {resume}. Vous y étiez presque !\n\nEn quelques clics, finalisez-les pour placer vos produits devant des milliers d''acheteurs au Gabon et booster vos ventes.\n\nBesoin d''un coup de main ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp, on vous accompagne.')
ON CONFLICT (cle) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_boost_evenements_relance
    ON boost_evenements (boost_id, type_evenement, date_creation);
