-- Plusieurs coupures par vendeur et par mois (plafond applicatif 100 000 FCFA).
ALTER TABLE public.versements_vendeurs
    DROP CONSTRAINT IF EXISTS versements_vendeurs_unique_vendeur_periode;

CREATE INDEX IF NOT EXISTS versements_vendeurs_vendeur_periode_idx
    ON public.versements_vendeurs (vendeur_id, periode_cle);

-- Okani (vendeur 374), octobre 2026. Relevés SHAP du 14 et 15 octobre.
-- Le troisième virement est parti sur 077091031, qui n'est pas le numéro enregistré du vendeur.
INSERT INTO public.versements_vendeurs (
    vendeur_id,
    periode_cle,
    montant,
    telephone,
    moyen,
    statut,
    shap_transaction_id,
    external_reference,
    created_at
)
SELECT 374, '2026-10', 100000, '076269911', 'airtel_money', 'effectue',
    'CI261015.1043.A13456', '1003357759', '2026-10-15 10:43:00+01'
WHERE NOT EXISTS (
    SELECT 1 FROM public.versements_vendeurs WHERE external_reference = '1003357759'
);

INSERT INTO public.versements_vendeurs (
    vendeur_id,
    periode_cle,
    montant,
    telephone,
    moyen,
    statut,
    shap_transaction_id,
    external_reference,
    created_at
)
SELECT 374, '2026-10', 100000, '076269911', 'airtel_money', 'effectue',
    'CI261015.1042.C38270', '1003357755', '2026-10-15 10:42:00+01'
WHERE NOT EXISTS (
    SELECT 1 FROM public.versements_vendeurs WHERE external_reference = '1003357755'
);

INSERT INTO public.versements_vendeurs (
    vendeur_id,
    periode_cle,
    montant,
    telephone,
    moyen,
    statut,
    shap_transaction_id,
    external_reference,
    created_at
)
SELECT 374, '2026-10', 100000, '077091031', 'airtel_money', 'effectue',
    'CI261014.1859.C07322', '1003357423', '2026-10-14 18:59:00+01'
WHERE NOT EXISTS (
    SELECT 1 FROM public.versements_vendeurs WHERE external_reference = '1003357423'
);
