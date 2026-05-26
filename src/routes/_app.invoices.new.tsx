import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtRs } from "@/lib/i18n";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({ customer: z.string().optional() });
const ADD_NEW = "__add_new__";

export const Route = createFileRoute("/_app/invoices/new")({
  component: NewInvoice,
  validateSearch: searchSchema,
});

interface LineItem { item_id: string; quantity: string; unit_price: string; labor_per_unit: string; }

function NewInvoice() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [customerId, setCustomerId] = useState(search.customer ?? "");
  const [lines, setLines] = useState<LineItem[]>([{ item_id: "", quantity: "", unit_price: "", labor_per_unit: "" }]);
  const [paid, setPaid] = useState("0");
  const [busy, setBusy] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["new-invoice-data"],
    queryFn: async () => {
      const [customers, items, prices, labor] = await Promise.all([
        supabase.from("customers").select("id, name, phone, current_balance").order("name"),
        supabase.from("items").select("*").order("name_en"),
        supabase.from("item_prices").select("*").order("created_at", { ascending: false }),
        (supabase as any).from("labor_charges").select("item_id, charge_per_unit, unit_label"),
      ]);
      const latestPrice = new Map<string, number>();
      (prices.data ?? []).forEach((p) => { if (!latestPrice.has(p.item_id)) latestPrice.set(p.item_id, Number(p.price)); });
      const laborMap = new Map<string, { charge_per_unit: number; unit_label: string }>();
      (labor.data ?? []).forEach((l: any) => laborMap.set(l.item_id, { charge_per_unit: Number(l.charge_per_unit), unit_label: l.unit_label ?? "per unit" }));
      return { customers: customers.data ?? [], items: items.data ?? [], latestPrice, laborMap };
    },
  });

  const { data: customPrices } = useQuery({
    queryKey: ["customer-prices", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await supabase.from("customer_prices").select("*").eq("customer_id", customerId);
      const map = new Map<string, number>();
      (data ?? []).forEach((p) => map.set(p.item_id, Number(p.price)));
      return map;
    },
  });

  const getPriceFor = (itemId: string): number => {
    return customPrices?.get(itemId) ?? data?.latestPrice.get(itemId) ?? 0;
  };
  const getLaborFor = (itemId: string): number => {
    return data?.laborMap.get(itemId)?.charge_per_unit ?? 0;
  };

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };

  const onItemChange = (i: number, itemId: string) => {
    const price = getPriceFor(itemId);
    const labor = getLaborFor(itemId);
    updateLine(i, { item_id: itemId, unit_price: price ? String(price) : "", labor_per_unit: String(labor) });
  };

  useEffect(() => {
    if (!customPrices) return;
    setLines((ls) => ls.map((l) => l.item_id ? { ...l, unit_price: String(getPriceFor(l.item_id)) } : l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPrices]);

  const itemsSubtotal = useMemo(() =>
    lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
  [lines]);
  const laborSubtotal = useMemo(() =>
    lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.labor_per_unit) || 0), 0),
  [lines]);
  const total = itemsSubtotal + laborSubtotal;

  const paidNum = Number(paid) || 0;
  const remaining = total - paidNum;

  const submit = async () => {
    if (!customerId) { toast.error("Select a customer"); return; }
    const validLines = lines.filter((l) => l.item_id && Number(l.quantity) > 0 && Number(l.unit_price) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item"); return; }
    setBusy(true);
    try {
      const { data: result, error } = await supabase.rpc("create_invoice", {
        p_customer_id: customerId,
        p_items: validLines.map((l) => ({
          item_id: l.item_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          labor_per_unit: Number(l.labor_per_unit) || 0,
        })) as any,
        p_paid_amount: paidNum,
      });
      if (error) throw error;
      const inv = Array.isArray(result) ? result[0] : result;
      toast.success(`Invoice ${inv.invoice_number} created`);
      navigate({ to: "/invoices/$id", params: { id: inv.invoice_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const selectedCustomer = data?.customers.find((c) => c.id === customerId);

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-24 md:pb-0">
      <h1 className="text-2xl font-bold">New Invoice <span className="urdu text-base text-muted-foreground">/ نئی رسید</span></h1>

      <Card className="p-5 space-y-3">
        <Label>Customer / گاہک</Label>
        <Select
          value={customerId}
          onValueChange={(v) => {
            if (v === ADD_NEW) { setAddCustomerOpen(true); return; }
            setCustomerId(v);
          }}
        >
          <SelectTrigger className="h-11"><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent>
            {data?.customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `· ${c.phone}` : ""}</SelectItem>)}
            {data?.customers.length ? <SelectSeparator /> : null}
            <SelectItem value={ADD_NEW}>
              <span className="flex items-center text-primary font-medium"><UserPlus className="h-4 w-4 mr-2" /> Add New Customer — نیا گاہک شامل کریں</span>
            </SelectItem>
          </SelectContent>
        </Select>
        {selectedCustomer && (
          <div className="text-sm text-muted-foreground">Current balance: <span className={Number(selectedCustomer.current_balance) > 0 ? "text-destructive font-medium" : "text-success font-medium"}>{fmtRs(selectedCustomer.current_balance)}</span></div>
        )}
      </Card>

      <AddCustomerInlineDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        onAdded={(id) => {
          qc.invalidateQueries({ queryKey: ["new-invoice-data"] });
          setCustomerId(id);
        }}
      />

      <Card className="p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Items / اشیاء</h2>
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, { item_id: "", quantity: "", unit_price: "", labor_per_unit: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => {
            const qty = Number(line.quantity) || 0;
            const price = Number(line.unit_price) || 0;
            const labor = Number(line.labor_per_unit) || 0;
            const laborTotal = qty * labor;
            const lineTotal = qty * price + laborTotal;
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border-b pb-3 last:border-b-0 last:pb-0">
                <div className="col-span-12 sm:col-span-4">
                  <Label className="text-xs">Item</Label>
                  <Select value={line.item_id} onValueChange={(v) => onItemChange(i, v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data?.items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name_en} ({it.unit})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" inputMode="decimal" className="h-11" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-xs">Price</Label>
                  <Input type="number" inputMode="decimal" className="h-11" value={line.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-xs">Labor/Unit</Label>
                  <Input type="number" inputMode="decimal" className="h-11" value={line.labor_per_unit} onChange={(e) => updateLine(i, { labor_per_unit: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-1 text-right">
                  <Label className="text-xs">Labor</Label>
                  <div className="h-11 flex items-center justify-end text-sm">{fmtRs(laborTotal)}</div>
                </div>
                <div className="col-span-9 sm:col-span-1 text-right">
                  <Label className="text-xs">Total</Label>
                  <div className="h-11 flex items-center justify-end font-semibold">{fmtRs(lineTotal)}</div>
                </div>
                <div className="col-span-3 sm:col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Items Subtotal / اشیاء</span>
            <span>{fmtRs(itemsSubtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Labor Charges / مزدوری</span>
            <span>{fmtRs(laborSubtotal)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between text-lg">
            <span className="font-medium">Grand Total / کل</span>
            <span className="font-bold">{fmtRs(total)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Paid Now / ادا شدہ</Label>
            <Input type="number" inputMode="decimal" className="h-11" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <Label>Balance Due / بقایا</Label>
            <div className={`h-11 flex items-center font-bold text-lg ${remaining > 0 ? "text-destructive" : "text-success"}`}>{fmtRs(remaining)}</div>
          </div>
        </div>
        <Button className="w-full h-12 text-base" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Create Invoice / رسید بنائیں"}</Button>
      </Card>
    </div>
  );
}

function AddCustomerInlineDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", opening_balance: "0" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const ob = Number(form.opening_balance) || 0;
      const { data, error } = await supabase.from("customers").insert({
        name: form.name.trim(), phone: form.phone, address: form.address,
        opening_balance: ob, current_balance: ob,
      }).select().single();
      if (error) throw error;
      if (ob !== 0 && data) {
        await supabase.from("customer_ledger").insert({
          customer_id: data.id, entry_type: "opening",
          debit: ob > 0 ? ob : 0, credit: ob < 0 ? -ob : 0,
          balance_after: ob, note: "Opening balance",
        });
      }
      toast.success("Customer added successfully");
      onAdded(data!.id);
      setForm({ name: "", phone: "", address: "", opening_balance: "0" });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add New Customer / نیا گاہک</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Opening Balance (Rs)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
