CREATE TABLE public.labor_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE UNIQUE,
  charge_per_unit decimal(10,2) NOT NULL DEFAULT 0,
  unit_label text DEFAULT 'per unit',
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labor_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.labor_charges
FOR ALL USING (true);

-- Insert default 0 charge for all existing items
INSERT INTO public.labor_charges (item_id, charge_per_unit, unit_label)
SELECT id, 0, 'per unit' FROM public.items
ON CONFLICT (item_id) DO NOTHING;
