import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SupplierTransactionsDialog } from "@/components/SupplierTransactionsDialog";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers")({ component: SuppliersPage });

function SuppliersPage() {
  const [selected, setSelected] = useState<any>(null);
  const { data, refetch } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold">Suppliers <span className="urdu text-base text-muted-foreground">/ سپلائر</span></h1>
        <AddSupplierDialog onAdded={refetch} />
      </div>
      <div className="grid gap-3">
        {data?.map((s) => (
          <Card key={s.id} className="p-4 hover:bg-accent cursor-pointer" onClick={() => setSelected(s)}>
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-muted-foreground">{s.phone || "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">We owe / واجب الادا</div>
                <div className={`text-lg font-bold ${Number(s.current_balance) > 0 ? "text-warning" : "text-success"}`}>{fmtRs(s.current_balance)}</div>
              </div>
            </div>
          </Card>
        ))}
        {data?.length === 0 && <p className="text-center text-muted-foreground py-8">No suppliers yet.</p>}
      </div>
      <SupplierTransactionsDialog supplier={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function AddSupplierDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", opening_balance: "0" });
  const submit = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    const ob = Number(form.opening_balance) || 0;
    const { data, error } = await supabase.from("suppliers").insert({
      name: form.name, phone: form.phone, address: form.address,
      opening_balance: ob, current_balance: ob,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (ob !== 0 && data) {
      await supabase.from("supplier_ledger").insert({
        supplier_id: data.id, entry_type: "opening",
        debit: ob < 0 ? -ob : 0, credit: ob > 0 ? ob : 0,
        balance_after: ob, note: "Opening balance",
      });
    }
    toast.success("Supplier added");
    setOpen(false); onAdded();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add Supplier</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Supplier / نیا سپلائر</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Opening Balance (we owe)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
