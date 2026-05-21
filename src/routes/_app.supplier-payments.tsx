import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_app/supplier-payments")({
  component: Page,
  validateSearch: z.object({ supplier: z.string().optional() }),
});

function Page() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState(search.supplier ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-for-pay"],
    queryFn: async () => (await supabase.from("suppliers").select("id, name, current_balance").order("name")).data ?? [],
  });

  const sup = suppliers?.find((s) => s.id === supplierId);

  const submit = async () => {
    if (!supplierId || !amount) { toast.error("Required"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_supplier_payment", {
        p_supplier_id: supplierId, p_amount: Number(amount), p_method: method, p_note: note || null,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      setAmount(""); setNote("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Supplier Payment <span className="urdu text-base text-muted-foreground">/ سپلائر کی ادائیگی</span></h1>
      <Card className="p-5 space-y-4">
        <div>
          <Label>Supplier / سپلائر</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {sup && (
          <div className="bg-accent/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground">We Owe / واجب الادا</div>
            <div className="text-2xl font-bold text-warning">{fmtRs(sup.current_balance)}</div>
          </div>
        )}
        <div><Label>Amount (Rs)</Label><Input type="number" inputMode="decimal" className="h-11 text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div>
          <Label>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Note</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button className="w-full h-12" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record Payment"}</Button>
      </Card>
    </div>
  );
}
