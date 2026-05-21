
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + assign first user as admin, others as staff
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ BUSINESS TABLES ============
CREATE TABLE public.business_settings (
  id INT PRIMARY KEY DEFAULT 1,
  business_name TEXT NOT NULL DEFAULT 'My Wholesale Business',
  address TEXT,
  phone TEXT,
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.business_settings (id) VALUES (1);

CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  low_stock_threshold NUMERIC NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_prices_item ON public.item_prices(item_id, created_at DESC);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, item_id)
);

CREATE SEQUENCE public.invoice_seq START 1;

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL
);

CREATE TABLE public.customer_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL, -- 'invoice' | 'payment' | 'opening'
  reference_id UUID,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cust_ledger ON public.customer_ledger(customer_id, created_at);

CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  invoice_id UUID REFERENCES public.invoices(id),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL
);

CREATE TABLE public.supplier_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  reference_id UUID,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stock (
  item_id UUID PRIMARY KEY REFERENCES public.items(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  change NUMERIC NOT NULL, -- positive=in, negative=out
  reason TEXT NOT NULL,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create stock row when item created
CREATE OR REPLACE FUNCTION public.create_stock_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.stock (item_id, quantity) VALUES (NEW.id, 0) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_item_stock AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.create_stock_row();

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Profiles: user reads own, admin reads all
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles: user reads own, admin manages
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Settings: all authed read, admin write
CREATE POLICY "all read settings" ON public.business_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write settings" ON public.business_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Items: all read, admin write, no delete for staff
CREATE POLICY "all read items" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert items" ON public.items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update items" ON public.items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete items" ON public.items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "all read item_prices" ON public.item_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert item_prices" ON public.item_prices FOR INSERT TO authenticated WITH CHECK (true);

-- Customers: all read+insert+update, only admin delete
CREATE POLICY "all read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "all update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete customers" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "all rw customer_prices" ON public.customer_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Invoices: all read+insert+update; only admin delete
CREATE POLICY "all read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "all update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "all read invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin delete invoice_items" ON public.invoice_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "all read cust_ledger" ON public.customer_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert cust_ledger" ON public.customer_ledger FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read cust_payments" ON public.customer_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert cust_payments" ON public.customer_payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "all update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "all read purchases" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert purchases" ON public.purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "all read purchase_items" ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert purchase_items" ON public.purchase_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read supp_ledger" ON public.supplier_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert supp_ledger" ON public.supplier_ledger FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read supp_payments" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert supp_payments" ON public.supplier_payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read stock" ON public.stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "all update stock" ON public.stock FOR UPDATE TO authenticated USING (true);
CREATE POLICY "all insert stock" ON public.stock FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "all read stock_mv" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "all insert stock_mv" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- ============ RPC: create invoice atomically ============
CREATE OR REPLACE FUNCTION public.create_invoice(
  p_customer_id UUID,
  p_items JSONB, -- [{item_id, quantity, unit_price}]
  p_paid_amount NUMERIC
) RETURNS TABLE(invoice_id UUID, invoice_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv_id UUID := gen_random_uuid();
  v_inv_num TEXT;
  v_total NUMERIC := 0;
  v_status TEXT;
  v_balance NUMERIC;
  v_item JSONB;
  v_qty NUMERIC; v_price NUMERIC; v_line NUMERIC; v_item_id UUID;
BEGIN
  v_inv_num := 'INV-' || lpad(nextval('public.invoice_seq')::TEXT, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_line := v_qty * v_price;
    v_total := v_total + v_line;
  END LOOP;

  IF p_paid_amount >= v_total THEN v_status := 'paid';
  ELSIF p_paid_amount > 0 THEN v_status := 'partial';
  ELSE v_status := 'unpaid';
  END IF;

  INSERT INTO public.invoices(id, invoice_number, customer_id, total_amount, paid_amount, status, created_by)
  VALUES (v_inv_id, v_inv_num, p_customer_id, v_total, p_paid_amount, v_status, auth.uid());

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_line := v_qty * v_price;

    INSERT INTO public.invoice_items(invoice_id, item_id, quantity, unit_price, line_total)
    VALUES (v_inv_id, v_item_id, v_qty, v_price, v_line);

    -- Deduct stock
    INSERT INTO public.stock(item_id, quantity) VALUES (v_item_id, -v_qty)
      ON CONFLICT (item_id) DO UPDATE SET quantity = public.stock.quantity - v_qty, updated_at = now();

    INSERT INTO public.stock_movements(item_id, change, reason, reference_id, created_by)
    VALUES (v_item_id, -v_qty, 'sale', v_inv_id, auth.uid());
  END LOOP;

  -- Customer ledger: debit total, credit paid
  SELECT current_balance INTO v_balance FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  v_balance := v_balance + v_total;
  INSERT INTO public.customer_ledger(customer_id, entry_type, reference_id, debit, credit, balance_after, note)
  VALUES (p_customer_id, 'invoice', v_inv_id, v_total, 0, v_balance, v_inv_num);

  IF p_paid_amount > 0 THEN
    v_balance := v_balance - p_paid_amount;
    INSERT INTO public.customer_ledger(customer_id, entry_type, reference_id, debit, credit, balance_after, note)
    VALUES (p_customer_id, 'payment', v_inv_id, 0, p_paid_amount, v_balance, 'Payment with ' || v_inv_num);
    INSERT INTO public.customer_payments(customer_id, amount, method, invoice_id, created_by)
    VALUES (p_customer_id, p_paid_amount, 'cash', v_inv_id, auth.uid());
  END IF;

  UPDATE public.customers SET current_balance = v_balance WHERE id = p_customer_id;

  RETURN QUERY SELECT v_inv_id, v_inv_num;
END; $$;

-- RPC: record customer payment
CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_customer_id UUID, p_amount NUMERIC, p_method TEXT, p_invoice_id UUID, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay_id UUID := gen_random_uuid(); v_balance NUMERIC;
BEGIN
  INSERT INTO public.customer_payments(id, customer_id, amount, method, invoice_id, note, created_by)
  VALUES (v_pay_id, p_customer_id, p_amount, p_method, p_invoice_id, p_note, auth.uid());

  SELECT current_balance INTO v_balance FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  v_balance := v_balance - p_amount;

  INSERT INTO public.customer_ledger(customer_id, entry_type, reference_id, debit, credit, balance_after, note)
  VALUES (p_customer_id, 'payment', v_pay_id, 0, p_amount, v_balance, COALESCE(p_note, 'Payment ' || p_method));

  UPDATE public.customers SET current_balance = v_balance WHERE id = p_customer_id;
  RETURN v_pay_id;
END; $$;

-- RPC: create purchase
CREATE OR REPLACE FUNCTION public.create_purchase(
  p_supplier_id UUID, p_items JSONB, p_paid_amount NUMERIC
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pur_id UUID := gen_random_uuid(); v_total NUMERIC := 0; v_balance NUMERIC;
  v_item JSONB; v_qty NUMERIC; v_price NUMERIC; v_line NUMERIC; v_item_id UUID;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total := v_total + (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC;
  END LOOP;

  INSERT INTO public.purchases(id, supplier_id, total_amount, paid_amount, created_by)
  VALUES (v_pur_id, p_supplier_id, v_total, p_paid_amount, auth.uid());

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_line := v_qty * v_price;

    INSERT INTO public.purchase_items(purchase_id, item_id, quantity, unit_price, line_total)
    VALUES (v_pur_id, v_item_id, v_qty, v_price, v_line);

    INSERT INTO public.stock(item_id, quantity) VALUES (v_item_id, v_qty)
      ON CONFLICT (item_id) DO UPDATE SET quantity = public.stock.quantity + v_qty, updated_at = now();

    INSERT INTO public.stock_movements(item_id, change, reason, reference_id, created_by)
    VALUES (v_item_id, v_qty, 'purchase', v_pur_id, auth.uid());
  END LOOP;

  -- Supplier ledger: credit total (we owe), debit paid
  SELECT current_balance INTO v_balance FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  v_balance := v_balance + v_total;
  INSERT INTO public.supplier_ledger(supplier_id, entry_type, reference_id, debit, credit, balance_after, note)
  VALUES (p_supplier_id, 'purchase', v_pur_id, 0, v_total, v_balance, 'Purchase');

  IF p_paid_amount > 0 THEN
    v_balance := v_balance - p_paid_amount;
    INSERT INTO public.supplier_ledger(supplier_id, entry_type, reference_id, debit, credit, balance_after, note)
    VALUES (p_supplier_id, 'payment', v_pur_id, p_paid_amount, 0, v_balance, 'Payment with purchase');
    INSERT INTO public.supplier_payments(supplier_id, amount, method, created_by)
    VALUES (p_supplier_id, p_paid_amount, 'cash', auth.uid());
  END IF;

  UPDATE public.suppliers SET current_balance = v_balance WHERE id = p_supplier_id;
  RETURN v_pur_id;
END; $$;

-- RPC: supplier payment
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_supplier_id UUID, p_amount NUMERIC, p_method TEXT, p_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay_id UUID := gen_random_uuid(); v_balance NUMERIC;
BEGIN
  INSERT INTO public.supplier_payments(id, supplier_id, amount, method, note, created_by)
  VALUES (v_pay_id, p_supplier_id, p_amount, p_method, p_note, auth.uid());

  SELECT current_balance INTO v_balance FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  v_balance := v_balance - p_amount;

  INSERT INTO public.supplier_ledger(supplier_id, entry_type, reference_id, debit, credit, balance_after, note)
  VALUES (p_supplier_id, 'payment', v_pay_id, p_amount, 0, v_balance, COALESCE(p_note, 'Payment ' || p_method));

  UPDATE public.suppliers SET current_balance = v_balance WHERE id = p_supplier_id;
  RETURN v_pay_id;
END; $$;

-- RPC: stock adjustment (admin)
CREATE OR REPLACE FUNCTION public.adjust_stock(p_item_id UUID, p_change NUMERIC, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can adjust stock';
  END IF;
  INSERT INTO public.stock(item_id, quantity) VALUES (p_item_id, p_change)
    ON CONFLICT (item_id) DO UPDATE SET quantity = public.stock.quantity + p_change, updated_at = now();
  INSERT INTO public.stock_movements(item_id, change, reason, created_by)
  VALUES (p_item_id, p_change, COALESCE(p_reason,'manual adjustment'), auth.uid());
END; $$;

-- Seed default items
INSERT INTO public.items (name_en, name_ur, unit) VALUES
  ('Cooking Oil', 'کھانے کا تیل', 'liter'),
  ('Ghee', 'گھی', 'kg'),
  ('Sugar', 'چینی', 'kg'),
  ('Rice', 'چاول', 'kg'),
  ('Flour', 'آٹا', 'kg');
