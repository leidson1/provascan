-- Fix: acertos column must support decimal values for discursive partial credit (0.5, 0.75)
ALTER TABLE public.resultados ALTER COLUMN acertos TYPE numeric(6,2);
