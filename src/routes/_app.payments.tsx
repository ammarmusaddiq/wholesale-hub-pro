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

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
  validateSearch: z.object({ customer: z.string().optional() }),
});

function PaymentsPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState(search.customer ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["customers-for-pay"],
    queryFn: async () => (await supabase.from("customers").select("id, name, phone, current_balance").order("name")).data ?? [],
  });

  const { data: openInvoices } = useQuery({
    queryKey: ["unpaid-invoices", customerId],
    enabled: !!customerId,
    queryFn: async () => (await supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status").eq("customer_id", customerId).neq("status", "paid").order("created_at", { ascending: false })).data ?? [],
  });

  const cust = customers?.find((c) => c.id === customerId);

  const submit = async () => {
    if (!customerId || !amount) { toast.error("Customer and amount required"); return; }
    const amt = Number(amount); if (amt <= 0) { toast.error("Amount must be positive"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_customer_payment", {
        p_customer_id: customerId, p_amount: amt, p_method: method,
        p_invoice_id: (invoiceId || null) as any, p_note: (note || null) as any,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      setAmount(""); setNote(""); setInvoiceId("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Customer Payment <span className="urdu text-base text-muted-foreground">/ گاہک کی ادائیگی</span></h1>

      <Card className="p-5 space-y-4">
        <div>
          <Label>Customer / گاہک</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {cust && (
          <div className="bg-accent/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground">Outstanding Balance / بقایا</div>
            <div className={`text-2xl font-bold ${Number(cust.current_balance) > 0 ? "text-destructive" : "text-success"}`}>{fmtRs(cust.current_balance)}</div>
          </div>
        )}

        <div>
          <Label>Amount (Rs) / رقم</Label>
          <Input type="number" inputMode="decimal" className="h-11 text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        <div>
          <Label>Method / طریقہ</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash / نقد</SelectItem>
              <SelectItem value="bank">Bank Transfer / بینک</SelectItem>
              <SelectItem value="cheque">Cheque / چیک</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {openInvoices && openInvoices.length > 0 && (
          <div>
            <Label>Link to Invoice (optional)</Label>
            <Select value={invoiceId} onValueChange={(v) => setInvoiceId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Not linked —</SelectItem>
                {openInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {fmtRs(Number(i.total_amount) - Number(i.paid_amount))}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button className="w-full h-12 text-base" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record Payment / ادائیگی محفوظ کریں"}</Button>
      </Card>
    </div>
  );
}
