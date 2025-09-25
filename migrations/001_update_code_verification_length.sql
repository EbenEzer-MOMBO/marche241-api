-- Migration pour étendre la longueur du champ code_verification
-- De 4 caractères à 6 caractères pour supporter les codes email

-- Modifier la colonne code_verification dans la table vendeurs
ALTER TABLE vendeurs 
ALTER COLUMN code_verification TYPE VARCHAR(6);

-- Ajouter un commentaire pour documenter le changement
COMMENT ON COLUMN vendeurs.code_verification IS 'Code de vérification à 6 chiffres pour authentification par email';

-- Optionnel: Ajouter une contrainte pour s'assurer que le code ne contient que des chiffres
ALTER TABLE vendeurs 
ADD CONSTRAINT check_code_verification_format 
CHECK (code_verification IS NULL OR code_verification ~ '^[0-9]{4,6}$');
