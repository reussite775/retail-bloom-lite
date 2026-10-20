ALTER TABLE public.digital_products ADD COLUMN product_type text NOT NULL DEFAULT 'file';
ALTER TABLE public.digital_products ADD CONSTRAINT digital_products_product_type_check CHECK (product_type IN ('file','formation','service','coaching')) NOT VALID;
UPDATE public.digital_products SET product_type = 'file' WHERE product_type IS NULL;
ALTER TABLE public.digital_products VALIDATE CONSTRAINT digital_products_product_type_check;