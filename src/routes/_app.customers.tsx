import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CustomerTransactionsDialog } from "@/components/CustomerTransactionsDialog";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_app/customers")({ component: CustomersPage });

function CustomersPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const { data: customers, refetch } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name");
      return data ?? [];
    },
  });

  const filtered = customers?.filter((c) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone ?? "").includes(q)
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Customers <span className="urdu text-base text-muted-foreground">/ گاہک</span></h1>
        <AddCustomerDialog onAdded={refetch} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or phone / نام یا فون سے تلاش" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-3">
        {filtered?.map((c) => (
          <Card key={c.id} className="p-4 hover:bg-accent transition-colors cursor-pointer" onClick={() => setSelected(c)}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-sm text-muted-foreground">{c.phone || "—"}</div>
                {c.address && <div className="text-xs text-muted-foreground mt-1">{c.address}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Balance / بقایا</div>
                <div className={`text-lg font-bold ${Number(c.current_balance) > 0 ? "text-destructive" : "text-success"}`}>
                  {fmtRs(c.current_balance)}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filtered?.length === 0 && <p className="text-center text-muted-foreground py-8">No customers found.</p>}
      </div>
      <CustomerTransactionsDialog customer={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function AddCustomerDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", opening_balance: "0" });
  const submit = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    const ob = Number(form.opening_balance) || 0;
    const { data, error } = await supabase.from("customers").insert({
      name: form.name, phone: form.phone, address: form.address,
      opening_balance: ob, current_balance: ob,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (ob !== 0 && data) {
      await supabase.from("customer_ledger").insert({
        customer_id: data.id, entry_type: "opening",
        debit: ob > 0 ? ob : 0, credit: ob < 0 ? -ob : 0,
        balance_after: ob, note: "Opening balance",
      });
    }
    toast.success("Customer added");
    setOpen(false); setForm({ name: "", phone: "", address: "", opening_balance: "0" }); onAdded();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus className="h-4 w-4 mr-1" /> Add Customer</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Customer / نیا گاہک</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Opening Balance (Rs)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
