
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS labor_per_unit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_total numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_invoice(p_customer_id uuid, p_items jsonb, p_paid_amount numeric)
 RETURNS TABLE(invoice_id uuid, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv_id UUID := gen_random_uuid();
  v_inv_num TEXT;
  v_total NUMERIC := 0;
  v_status TEXT;
  v_balance NUMERIC;
  v_item JSONB;
  v_qty NUMERIC; v_price NUMERIC; v_labor NUMERIC; v_labor_total NUMERIC; v_line NUMERIC; v_item_id UUID;
BEGIN
  v_inv_num := 'INV-' || lpad(nextval('public.invoice_seq')::TEXT, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_labor := COALESCE((v_item->>'labor_per_unit')::NUMERIC, 0);
    v_line := v_qty * v_price + v_qty * v_labor;
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
    v_labor := COALESCE((v_item->>'labor_per_unit')::NUMERIC, 0);
    v_labor_total := v_qty * v_labor;
    v_line := v_qty * v_price + v_labor_total;

    INSERT INTO public.invoice_items(invoice_id, item_id, quantity, unit_price, line_total, labor_per_unit, labor_total)
    VALUES (v_inv_id, v_item_id, v_qty, v_price, v_line, v_labor, v_labor_total);

    INSERT INTO public.stock(item_id, quantity) VALUES (v_item_id, -v_qty)
      ON CONFLICT (item_id) DO UPDATE SET quantity = public.stock.quantity - v_qty, updated_at = now();

    INSERT INTO public.stock_movements(item_id, change, reason, reference_id, created_by)
    VALUES (v_item_id, -v_qty, 'sale', v_inv_id, auth.uid());
  END LOOP;

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
END; $function$;
