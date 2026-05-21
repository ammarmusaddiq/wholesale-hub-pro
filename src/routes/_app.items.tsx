import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, History } from "lucide-react";

export const Route = createFileRoute("/_app/items")({ component: ItemsPage });

function ItemsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["items-with-price"],
    queryFn: async () => {
      const { data: itemsData } = await supabase.from("items").select("*").order("name_en");
      const { data: pricesData } = await supabase.from("item_prices").select("*").order("created_at", { ascending: false });
      return (itemsData ?? []).map((item) => {
        const prices = (pricesData ?? []).filter((p) => p.item_id === item.id);
        return { ...item, current_price: prices[0]?.price ?? 0, last_updated: prices[0]?.created_at, history: prices.slice(0, 10) };
      });
    },
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Items & Pricing <span className="urdu text-base text-muted-foreground">/ اشیاء اور قیمتیں</span></h1>
        </div>
        {isAdmin && <AddItemDialog onAdded={() => qc.invalidateQueries({ queryKey: ["items-with-price"] })} />}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {items?.map((item) => (
          <Card key={item.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{item.name_en}</h3>
                <p className="urdu text-muted-foreground">{item.name_ur}</p>
                <p className="text-xs text-muted-foreground mt-1">Unit: {item.unit}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{fmtRs(item.current_price)}</div>
                {item.last_updated && <div className="text-xs text-muted-foreground">{new Date(item.last_updated).toLocaleDateString()}</div>}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <UpdatePriceDialog item={item} onDone={() => qc.invalidateQueries({ queryKey: ["items-with-price"] })} />
              <HistoryDialog item={item} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UpdatePriceDialog({ item, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const { user } = useAuth();

  const submit = async () => {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) { toast.error("Enter valid price"); return; }
    const { error } = await supabase.from("item_prices").insert({ item_id: item.id, price: p, note, changed_by: user?.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Price updated");
    setOpen(false); setPrice(""); setNote(""); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1">Update Price <span className="urdu text-xs ml-1">/ قیمت</span></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Price — {item.name_en}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>New Price (Rs)</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus /></div>
          <div><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. market rate increase" /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ item }: any) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><History className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Price History — {item.name_en}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {item.history.length === 0 && <p className="text-sm text-muted-foreground">No history yet.</p>}
          {item.history.map((h: any) => (
            <div key={h.id} className="flex justify-between p-2 border-b">
              <div>
                <div className="font-medium">{fmtRs(h.price)}</div>
                {h.note && <div className="text-xs text-muted-foreground">{h.note}</div>}
              </div>
              <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_en: "", name_ur: "", unit: "kg", low_stock_threshold: "50" });

  const submit = async () => {
    if (!form.name_en || !form.name_ur) { toast.error("Enter both names"); return; }
    const { error } = await supabase.from("items").insert({
      name_en: form.name_en, name_ur: form.name_ur, unit: form.unit,
      low_stock_threshold: Number(form.low_stock_threshold) || 50,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setOpen(false); setForm({ name_en: "", name_ur: "", unit: "kg", low_stock_threshold: "50" }); onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add Item</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add New Item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name (English)</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><Label>Name (Urdu)</Label><Input className="urdu" value={form.name_ur} onChange={(e) => setForm({ ...form, name_ur: e.target.value })} /></div>
          <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div><Label>Low Stock Threshold</Label><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
