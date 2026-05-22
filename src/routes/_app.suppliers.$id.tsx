import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers/$id")({ component: SupplierDetail });

function SupplierDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const [sup, ledger, purchases, purItems] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        supabase.from("supplier_ledger").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
        supabase.from("purchases").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
        supabase.from("purchase_items").select("*, items(name_en, name_ur, unit), purchases!inner(supplier_id)").eq("purchases.supplier_id", id),
      ]);
      return {
        supplier: sup.data,
        ledger: ledger.data ?? [],
        purchases: purchases.data ?? [],
        purchaseItems: purItems.data ?? [],
      };
    },
  });

  if (!data?.supplier) return <div className="p-8 text-center">Loading…</div>;
  const s = data.supplier;

  const totalPurchased = data.purchases.reduce((sum, p) => sum + Number(p.total_amount), 0);
  const totalPaid = data.purchases.reduce((sum, p) => sum + Number(p.paid_amount), 0);
  const balanceDue = totalPurchased - totalPaid;
  const itemsByPurchase = new Map<string, any[]>();
  data.purchaseItems.forEach((it: any) => {
    const arr = itemsByPurchase.get(it.purchase_id) ?? [];
    arr.push(it);
    itemsByPurchase.set(it.purchase_id, arr);
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link to="/suppliers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Link>
      <Card className="p-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">{s.name}</h1>
            <p className="text-sm text-muted-foreground">{s.phone || "—"} · {s.address || "—"}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">We Owe / واجب الادا</div>
            <div className={`text-3xl font-bold ${Number(s.current_balance) > 0 ? "text-destructive" : "text-success"}`}>{fmtRs(s.current_balance)}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button asChild><Link to="/purchases/new" search={{ supplier: s.id } as any}>+ New Purchase</Link></Button>
          <Button variant="outline" asChild><Link to="/supplier-payments" search={{ supplier: s.id } as any}>Record Payment</Link></Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard title="Total Purchased / کل خریداری" value={fmtRs(totalPurchased)} />
        <SummaryCard title="Total Paid / کل ادائیگی" value={fmtRs(totalPaid)} tone="success" />
        <SummaryCard title="Balance Due / واجب الادا" value={fmtRs(balanceDue)} tone={balanceDue > 0 ? "destructive" : "success"} />
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Purchases / خریداری</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3"></th>
                <th className="pr-3">Date</th><th className="pr-3">Purchase#</th><th className="pr-3">Items</th>
                <th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Paid</th>
                <th className="pr-3 text-right">Balance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No purchases yet.</td></tr>}
              {data.purchases.map((p) => (
                <PurchaseRow key={p.id} purchase={p} items={itemsByPurchase.get(p.id) ?? []} />
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
                tab === "all" ? true : tab === "purchases" ? l.entry_type === "purchase" || l.entry_type === "opening" : l.entry_type === "payment"
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

function PurchaseRow({ purchase, items }: { purchase: any; items: any[] }) {
  const [open, setOpen] = useState(false);
  const balance = Number(purchase.total_amount) - Number(purchase.paid_amount);
  const status = balance <= 0 ? "paid" : Number(purchase.paid_amount) > 0 ? "partial" : "unpaid";
  const shortId = purchase.id.slice(0, 8).toUpperCase();
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-accent" onClick={() => setOpen(!open)}>
        <td className="py-2 pr-3 w-8">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="pr-3 whitespace-nowrap">{new Date(purchase.created_at).toLocaleDateString()}</td>
        <td className="pr-3 font-medium">#{shortId}</td>
        <td className="pr-3 text-muted-foreground text-xs">{items.length} item{items.length !== 1 ? "s" : ""}</td>
        <td className="pr-3 text-right">{fmtRs(purchase.total_amount)}</td>
        <td className="pr-3 text-right text-success">{fmtRs(purchase.paid_amount)}</td>
        <td className="pr-3 text-right font-medium">{fmtRs(balance)}</td>
        <td><Badge variant={status === "paid" ? "default" : status === "partial" ? "secondary" : "destructive"}>{status}</Badge></td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={7} className="py-3 pr-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1">Item</th><th className="text-right">Qty</th>
                  <th className="text-right">Unit Cost</th><th className="text-right">Line Total</th>
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
            <th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Note</th>
            <th className="pr-3 text-right">Paid</th><th className="pr-3 text-right">Purchase</th><th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
          {entries.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-3">{new Date(l.created_at).toLocaleDateString()}</td>
              <td className="pr-3"><span className="px-2 py-0.5 rounded text-xs bg-secondary">{l.entry_type}</span></td>
              <td className="pr-3 text-muted-foreground">{l.note}</td>
              <td className="pr-3 text-right text-success">{Number(l.debit) > 0 ? fmtRs(l.debit) : "—"}</td>
              <td className="pr-3 text-right">{Number(l.credit) > 0 ? fmtRs(l.credit) : "—"}</td>
              <td className="text-right font-medium">{fmtRs(l.balance_after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
