import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

export function CustomerTransactionsDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    enabled: open && !!customer?.id,
    queryKey: ["customer-tx", customer?.id],
    queryFn: async () => {
      const [ledger, invoices, invItems, payments] = await Promise.all([
        supabase.from("customer_ledger").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }),
        supabase.from("invoice_items").select("*, items(name_en, name_ur, unit), invoices!inner(customer_id)").eq("invoices.customer_id", customer.id),
        supabase.from("customer_payments").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }),
      ]);
      return {
        ledger: ledger.data ?? [],
        invoices: invoices.data ?? [],
        invoiceItems: invItems.data ?? [],
        payments: payments.data ?? [],
      };
    },
  });

  if (!customer) return null;
  const totalPurchased = (data?.invoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = (data?.invoices ?? []).reduce((s, i) => s + Number(i.paid_amount), 0);
  const balanceDue = totalPurchased - totalPaid;
  const itemsByInvoice = new Map<string, any[]>();
  (data?.invoiceItems ?? []).forEach((it: any) => {
    const arr = itemsByInvoice.get(it.invoice_id) ?? [];
    arr.push(it);
    itemsByInvoice.set(it.invoice_id, arr);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <div>{customer.name}</div>
              <div className="text-xs font-normal text-muted-foreground">{customer.phone || "—"} · {customer.address || "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-normal">Outstanding / بقایا</div>
              <div className={`text-2xl font-bold ${Number(customer.current_balance) > 0 ? "text-destructive" : "text-success"}`}>
                {fmtRs(customer.current_balance)}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <SumCard title="Purchased / خریداری" value={fmtRs(totalPurchased)} />
              <SumCard title="Paid / ادائیگی" value={fmtRs(totalPaid)} tone="success" />
              <SumCard title="Due / واجب" value={fmtRs(balanceDue)} tone={balanceDue > 0 ? "destructive" : "success"} />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" asChild><Link to="/invoices/new" search={{ customer: customer.id } as any}>+ New Invoice</Link></Button>
              <Button size="sm" variant="outline" asChild><Link to="/payments" search={{ customer: customer.id } as any}>Record Payment</Link></Button>
              <Button size="sm" variant="ghost" asChild><Link to="/customers/$id" params={{ id: customer.id }}><ExternalLink className="h-3 w-3 mr-1" /> Full page</Link></Button>
            </div>

            <Tabs defaultValue="invoices">
              <TabsList>
                <TabsTrigger value="invoices">Invoices / رسیدیں</TabsTrigger>
                <TabsTrigger value="payments">Payments / ادائیگی</TabsTrigger>
                <TabsTrigger value="ledger">Ledger / کھاتہ</TabsTrigger>
              </TabsList>

              <TabsContent value="invoices">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-2"></th><th className="pr-2">Date</th><th className="pr-2">Invoice#</th>
                        <th className="pr-2 text-right">Total</th><th className="pr-2 text-right">Paid</th>
                        <th className="pr-2 text-right">Balance</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.invoices.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No invoices yet.</td></tr>}
                      {data!.invoices.map((inv) => (
                        <InvoiceRow key={inv.id} inv={inv} items={itemsByInvoice.get(inv.id) ?? []} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="payments">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-2">Date</th><th className="pr-2">Method</th>
                        <th className="pr-2">Note</th><th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.payments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No payments yet.</td></tr>}
                      {data!.payments.map((p) => (
                        <tr key={p.id} className="border-b">
                          <td className="py-2 pr-2">{new Date(p.created_at).toLocaleDateString()}</td>
                          <td className="pr-2"><Badge variant="secondary">{p.method}</Badge></td>
                          <td className="pr-2 text-muted-foreground">{p.note || "—"}</td>
                          <td className="text-right font-medium text-success">{fmtRs(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="ledger">
                <LedgerTable entries={data!.ledger} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SumCard({ title, value, tone }: { title: string; value: string; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
    </Card>
  );
}

function InvoiceRow({ inv, items }: { inv: any; items: any[] }) {
  const [open, setOpen] = useState(false);
  const balance = Number(inv.total_amount) - Number(inv.paid_amount);
  const status = inv.status;
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-accent" onClick={() => setOpen(!open)}>
        <td className="py-2 pr-2 w-6">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="pr-2 whitespace-nowrap">{new Date(inv.created_at).toLocaleDateString()}</td>
        <td className="pr-2 font-medium">{inv.invoice_number}</td>
        <td className="pr-2 text-right">{fmtRs(inv.total_amount)}</td>
        <td className="pr-2 text-right text-success">{fmtRs(inv.paid_amount)}</td>
        <td className="pr-2 text-right font-medium">{fmtRs(balance)}</td>
        <td><Badge variant={status === "paid" ? "default" : status === "partial" ? "secondary" : "destructive"}>{status}</Badge></td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={6} className="py-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1">Item</th><th className="text-right">Qty</th>
                  <th className="text-right">Unit Price</th><th className="text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-1">{it.items?.name_en} <span className="urdu text-muted-foreground">{it.items?.name_ur}</span></td>
                    <td className="text-right">{it.quantity} {it.items?.unit}</td>
                    <td className="text-right">{fmtRs(it.unit_price)}</td>
                    <td className="text-right font-medium">{fmtRs(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function LedgerTable({ entries }: { entries: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-2">Date</th><th className="pr-2">Type</th><th className="pr-2">Note</th>
            <th className="pr-2 text-right">Debit</th><th className="pr-2 text-right">Credit</th><th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
          {entries.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-2 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</td>
              <td className="pr-2"><span className="px-2 py-0.5 rounded text-xs bg-secondary">{l.entry_type}</span></td>
              <td className="pr-2 text-muted-foreground">{l.note}</td>
              <td className="pr-2 text-right">{Number(l.debit) > 0 ? fmtRs(l.debit) : "—"}</td>
              <td className="pr-2 text-right text-success">{Number(l.credit) > 0 ? fmtRs(l.credit) : "—"}</td>
              <td className="text-right font-medium">{fmtRs(l.balance_after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
