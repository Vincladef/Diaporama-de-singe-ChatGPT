-- Supprimer uniquement la limite artificielle de longueur des consignes de création.
-- Le champ PostgreSQL TEXT conserve intégralement les instructions existantes.
ALTER TABLE public.slide_creation_instructions
  DROP CONSTRAINT IF EXISTS max_creation_instructions;
