import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtRs } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_app/purchases/new")({
  component: NewPurchase,
  validateSearch: z.object({ supplier: z.string().optional() }),
});

interface Line { item_id: string; quantity: string; unit_price: string; }

function NewPurchase() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [supplierId, setSupplierId] = useState(search.supplier ?? "");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", quantity: "", unit_price: "" }]);
  const [paid, setPaid] = useState("0");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["new-purchase-data"],
    queryFn: async () => {
      const [s, i] = await Promise.all([
        supabase.from("suppliers").select("id, name, current_balance").order("name"),
        supabase.from("items").select("*").order("name_en"),
      ]);
      return { suppliers: s.data ?? [], items: i.data ?? [] };
    },
  });

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0), [lines]);

  const submit = async () => {
    if (!supplierId) { toast.error("Select supplier"); return; }
    const valid = lines.filter((l) => l.item_id && Number(l.quantity) > 0 && Number(l.unit_price) > 0);
    if (!valid.length) { toast.error("Add items"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_purchase", {
        p_supplier_id: supplierId,
        p_items: valid.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
        p_paid_amount: Number(paid) || 0,
      });
      if (error) throw error;
      toast.success("Purchase recorded, stock updated");
      navigate({ to: "/suppliers/$id", params: { id: supplierId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sup = data?.suppliers.find((s) => s.id === supplierId);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">New Purchase <span className="urdu text-base text-muted-foreground">/ نئی خریداری</span></h1>

      <Card className="p-5 space-y-3">
        <Label>Supplier / سپلائر</Label>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Select supplier" /></SelectTrigger>
          <SelectContent>{data?.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        {sup && <div className="text-sm text-muted-foreground">We owe: <span className="text-warning font-medium">{fmtRs(sup.current_balance)}</span></div>}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Items Purchased / خریدی اشیاء</h2>
          <Button size="sm" variant="outline" onClick={() => setLines([...lines, { item_id: "", quantity: "", unit_price: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {lines.map((line, i) => {
          const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-xs">Item</Label>
                <Select value={line.item_id} onValueChange={(v) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, item_id: v } : l))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{data?.items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-4 sm:col-span-2"><Label className="text-xs">Qty</Label><Input type="number" inputMode="decimal" className="h-11" value={line.quantity} onChange={(e) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, quantity: e.target.value } : l))} /></div>
              <div className="col-span-4 sm:col-span-2"><Label className="text-xs">Price</Label><Input type="number" inputMode="decimal" className="h-11" value={line.unit_price} onChange={(e) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, unit_price: e.target.value } : l))} /></div>
              <div className="col-span-3 sm:col-span-2 text-right"><Label className="text-xs">Total</Label><div className="h-11 flex items-center justify-end font-semibold">{fmtRs(lineTotal)}</div></div>
              <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          );
        })}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex justify-between text-lg"><span className="font-medium">Total</span><span className="font-bold">{fmtRs(total)}</span></div>
        <div><Label>Paid Now / ادا شدہ</Label><Input type="number" inputMode="decimal" className="h-11" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
        <div className="flex justify-between"><span>Outstanding / بقایا</span><span className={`font-bold ${total - Number(paid || 0) > 0 ? "text-warning" : "text-success"}`}>{fmtRs(total - Number(paid || 0))}</span></div>
        <Button className="w-full h-12 text-base" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save Purchase / خریداری محفوظ"}</Button>
      </Card>
    </div>
  );
}
