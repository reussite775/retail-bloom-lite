CREATE OR REPLACE FUNCTION public.digital_products_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Interdit'; END IF;
  IF length(btrim(NEW.title)) = 0 OR length(NEW.title) > 200 THEN RAISE EXCEPTION 'Titre invalide'; END IF;
  IF length(NEW.description) > 5000 THEN RAISE EXCEPTION 'Description trop longue'; END IF;
  -- Le fichier n'est obligatoire que pour les produits de type "fichier numérique" ;
  -- les formations, services et coaching peuvent être publiés sans fichier.
  IF NEW.status = 'published' AND NEW.product_type = 'file' AND NEW.file_path IS NULL THEN RAISE EXCEPTION 'Ajoutez le fichier avant de publier'; END IF;
  RETURN NEW;
END
$function$;