import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Tag, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/customers/$id")({ component: CustomerDetail });

function CustomerDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [cust, ledger, prices, items, invoices, invItems] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
        supabase.from("customer_ledger").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("customer_prices").select("*, items(name_en, name_ur, unit)").eq("customer_id", id),
        supabase.from("items").select("*").order("name_en"),
        supabase.from("invoices").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("invoice_items").select("*, items(name_en, name_ur, unit), invoices!inner(customer_id)").eq("invoices.customer_id", id),
      ]);
      return {
        customer: cust.data,
        ledger: ledger.data ?? [],
        prices: prices.data ?? [],
        items: items.data ?? [],
        invoices: invoices.data ?? [],
        invoiceItems: invItems.data ?? [],
      };
    },
  });

  if (!data?.customer) return <div className="text-center p-8">Loading…</div>;
  const c = data.customer;

  const totalPurchased = data.invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = data.invoices.reduce((s, i) => s + Number(i.paid_amount), 0);
  const balanceDue = totalPurchased - totalPaid;
  const itemsByInvoice = new Map<string, any[]>();
  data.invoiceItems.forEach((it: any) => {
    const arr = itemsByInvoice.get(it.invoice_id) ?? [];
    arr.push(it);
    itemsByInvoice.set(it.invoice_id, arr);
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link to="/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Customers
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <p className="text-sm text-muted-foreground">{c.phone || "—"} · {c.address || "—"}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Outstanding / بقایا</div>
            <div className={`text-3xl font-bold ${Number(c.current_balance) > 0 ? "text-destructive" : "text-success"}`}>
              {fmtRs(c.current_balance)}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button asChild><Link to="/invoices/new" search={{ customer: c.id } as any}>+ New Invoice</Link></Button>
          <Button variant="outline" asChild><Link to="/payments" search={{ customer: c.id } as any}>Record Payment</Link></Button>
          <CustomPricesDialog customer={c} items={data.items} prices={data.prices} onChange={() => qc.invalidateQueries({ queryKey: ["customer", id] })} />
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard title="Total Purchased / کل خریداری" value={fmtRs(totalPurchased)} />
        <SummaryCard title="Total Paid / کل ادائیگی" value={fmtRs(totalPaid)} tone="success" />
        <SummaryCard title="Balance Due / واجب الادا" value={fmtRs(balanceDue)} tone={balanceDue > 0 ? "destructive" : "success"} />
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Invoices / رسیدیں</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3"></th>
                <th className="pr-3">Date</th><th className="pr-3">Invoice#</th><th className="pr-3">Items</th>
                <th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Paid</th>
                <th className="pr-3 text-right">Balance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No invoices yet.</td></tr>}
              {data.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} items={itemsByInvoice.get(inv.id) ?? []} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Ledger / کھاتہ</h2>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>
          {["all", "purchases", "payments"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <LedgerTable entries={data.ledger.filter((l) =>
                tab === "all" ? true : tab === "purchases" ? l.entry_type === "invoice" || l.entry_type === "opening" : l.entry_type === "payment"
              )} />
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: string; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${cls}`}>{value}</div>
    </Card>
  );
}

function InvoiceRow({ inv, items }: { inv: any; items: any[] }) {
  const [open, setOpen] = useState(false);
  const balance = Number(inv.total_amount) - Number(inv.paid_amount);
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-accent" onClick={() => setOpen(!open)}>
        <td className="py-2 pr-3 w-8">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="pr-3 whitespace-nowrap">{new Date(inv.created_at).toLocaleDateString()}</td>
        <td className="pr-3 font-medium">{inv.invoice_number}</td>
        <td className="pr-3 text-muted-foreground text-xs">{items.length} item{items.length !== 1 ? "s" : ""}</td>
        <td className="pr-3 text-right">{fmtRs(inv.total_amount)}</td>
        <td className="pr-3 text-right text-success">{fmtRs(inv.paid_amount)}</td>
        <td className="pr-3 text-right font-medium">{fmtRs(balance)}</td>
        <td><StatusBadge status={inv.status} /></td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={7} className="py-3 pr-3">
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

function StatusBadge({ status }: { status: string }) {
  const variant = status === "paid" ? "default" : status === "partial" ? "secondary" : "destructive";
  return <Badge variant={variant as any}>{status}</Badge>;
}

function LedgerTable({ entries }: { entries: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Note</th>
            <th className="pr-3 text-right">Debit</th><th className="pr-3 text-right">Credit</th><th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
          {entries.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-3 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</td>
              <td className="pr-3"><span className="px-2 py-0.5 rounded text-xs bg-secondary">{l.entry_type}</span></td>
              <td className="pr-3 text-muted-foreground">{l.note}</td>
              <td className="pr-3 text-right">{Number(l.debit) > 0 ? fmtRs(l.debit) : "—"}</td>
              <td className="pr-3 text-right text-success">{Number(l.credit) > 0 ? fmtRs(l.credit) : "—"}</td>
              <td className="text-right font-medium">{fmtRs(l.balance_after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomPricesDialog({ customer, items, prices, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");

  const add = async () => {
    const p = parseFloat(price);
    if (!itemId || isNaN(p)) { toast.error("Select item & price"); return; }
    const { error } = await supabase.from("customer_prices").upsert(
      { customer_id: customer.id, item_id: itemId, price: p },
      { onConflict: "customer_id,item_id" }
    );
    if (error) { toast.error(error.message); return; }
    toast.success("Custom price saved");
    setItemId(""); setPrice(""); onChange();
  };

  const remove = async (id: string) => {
    await supabase.from("customer_prices").delete().eq("id", id);
    onChange();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Tag className="h-4 w-4 mr-1" /> Custom Prices</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Custom Prices for {customer.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {prices.length === 0 && <p className="text-sm text-muted-foreground">No custom prices set.</p>}
            {prices.map((p: any) => (
              <div key={p.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <div className="font-medium text-sm">{p.items?.name_en} <span className="urdu text-xs text-muted-foreground">{p.items?.name_ur}</span></div>
                  <div className="text-xs text-muted-foreground">{fmtRs(p.price)} / {p.items?.unit}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>Remove</Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end pt-3 border-t">
            <div>
              <Label>Item</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>{items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Price</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <Button onClick={add}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
