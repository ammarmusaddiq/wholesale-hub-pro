import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtRs } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { ChevronDown, Printer, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

const GREEN = "#1a7a4a";
const RED = "#e74c3c";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ReportsPage() {
  const { isAdmin, loading } = useAuth();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  const fromIso = from + "T00:00:00";
  const toIso = to + "T23:59:59";

  return (
    <div className="space-y-6 max-w-7xl mx-auto print:max-w-none">
      <div className="flex items-start justify-between gap-4 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            Reports & Analytics{" "}
            <span className="urdu text-base text-muted-foreground">/ رپورٹس</span>
          </h1>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="p-4 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>From / سے</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To / تک</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
          <TabsTrigger value="overview">Overview / خلاصہ</TabsTrigger>
          <TabsTrigger value="items">Items / اشیاء</TabsTrigger>
          <TabsTrigger value="customers">Customers / گاہک</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers / سپلائر</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab fromIso={fromIso} toIso={toIso} from={from} to={to} />
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <ItemsTab fromIso={fromIso} toIso={toIso} />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <CustomersTab fromIso={fromIso} toIso={toIso} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <SuppliersTab fromIso={fromIso} toIso={toIso} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Shared hooks ----------

function useRangeData(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["reports-range", fromIso, toIso],
    queryFn: async () => {
      const [invs, invItems, purs, purItems] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, created_at, total_amount, paid_amount, customer_id")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("invoice_items")
          .select("item_id, quantity, unit_price, line_total, invoices!inner(created_at)")
          .gte("invoices.created_at", fromIso)
          .lte("invoices.created_at", toIso),
        supabase
          .from("purchases")
          .select("id, created_at, total_amount, paid_amount, supplier_id")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("purchase_items")
          .select("item_id, quantity, unit_price, line_total, purchases!inner(created_at)")
          .gte("purchases.created_at", fromIso)
          .lte("purchases.created_at", toIso),
      ]);
      return {
        invoices: invs.data ?? [],
        invoiceItems: invItems.data ?? [],
        purchases: purs.data ?? [],
        purchaseItems: purItems.data ?? [],
      };
    },
  });
}

function useAllPurchaseItems() {
  return useQuery({
    queryKey: ["reports-all-purchase-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("item_id, quantity, unit_price, purchases!inner(created_at, supplier_id, suppliers(name))")
        .order("created_at", { ascending: true, referencedTable: "purchases" });
      return data ?? [];
    },
  });
}

function useAllInvoiceItems() {
  return useQuery({
    queryKey: ["reports-all-invoice-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("item_id, quantity, invoices!inner(created_at)")
        .order("created_at", { ascending: true, referencedTable: "invoices" });
      return data ?? [];
    },
  });
}

// Stock-aware weighted average cost.
// Processes purchases AND sales chronologically. Sales reduce qty but leave avg unchanged.
function computeStockAwareAvg(
  purchases: any[],
  sales: any[],
): { finalAvg: number; batches: any[] } {
  type Ev =
    | { date: string; type: "purchase"; qty: number; price: number; supplier: string }
    | { date: string; type: "sale"; qty: number };
  const events: Ev[] = [];
  purchases.forEach((r: any) => {
    events.push({
      date: r.purchases?.created_at ?? "",
      type: "purchase",
      qty: Number(r.quantity),
      price: Number(r.unit_price),
      supplier: r.purchases?.suppliers?.name ?? "—",
    });
  });
  sales.forEach((r: any) => {
    events.push({
      date: r.invoices?.created_at ?? "",
      type: "sale",
      qty: Number(r.quantity),
    });
  });
  events.sort((a, b) => a.date.localeCompare(b.date));

  let stock = 0;
  let avg = 0;
  const batches: any[] = [];
  for (const ev of events) {
    if (ev.type === "purchase") {
      const baseQty = Math.max(stock, 0);
      const denom = baseQty + ev.qty;
      const newAvg = denom > 0 ? (baseQty * avg + ev.qty * ev.price) / denom : ev.price;
      stock += ev.qty;
      avg = newAvg;
      batches.push({
        date: ev.date.slice(0, 10),
        supplier: ev.supplier,
        qty: ev.qty,
        unitCost: ev.price,
        avgAfter: Math.round(newAvg * 100) / 100,
      });
    } else {
      stock -= ev.qty;
    }
  }
  return { finalAvg: avg, batches };
}

function weightedAvgCost(rows: { quantity: number | string; unit_price: number | string }[]) {
  let totalQty = 0;
  let totalCost = 0;
  rows.forEach((r) => {
    const q = Number(r.quantity);
    const p = Number(r.unit_price);
    totalQty += q;
    totalCost += q * p;
  });
  return totalQty > 0 ? totalCost / totalQty : 0;
}

function EmptyState({ msg = "No data for selected period" }: { msg?: string }) {
  return (
    <Card className="p-10 text-center text-muted-foreground">
      {msg}
      <div className="urdu text-sm mt-1">اس مدت میں کوئی ڈیٹا نہیں</div>
    </Card>
  );
}

function LoadingBlock() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

// ---------- TAB 1: OVERVIEW ----------

function OverviewTab({
  fromIso,
  toIso,
  from,
  to,
}: {
  fromIso: string;
  toIso: string;
  from: string;
  to: string;
}) {
  const { data, isLoading } = useRangeData(fromIso, toIso);
  const { data: allPurItems } = useAllPurchaseItems();

  const metrics = useMemo(() => {
    if (!data) return null;
    const totalSales = data.invoices.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalCollected = data.invoices.reduce((s, r) => s + Number(r.paid_amount), 0);
    const outstanding = totalSales - totalCollected;
    const totalPurchases = data.purchases.reduce((s, r) => s + Number(r.total_amount), 0);

    // avg cost per item (all-time)
    const avgCostByItem = new Map<string, number>();
    if (allPurItems) {
      const grouped = new Map<string, typeof allPurItems>();
      allPurItems.forEach((r: any) => {
        const arr = grouped.get(r.item_id) ?? [];
        arr.push(r);
        grouped.set(r.item_id, arr);
      });
      grouped.forEach((rows, id) => avgCostByItem.set(id, weightedAvgCost(rows)));
    }

    let revenue = 0;
    let costOfGoodsSold = 0;
    data.invoiceItems.forEach((r: any) => {
      const qty = Number(r.quantity);
      revenue += Number(r.line_total);
      const cost = avgCostByItem.get(r.item_id) ?? 0;
      costOfGoodsSold += qty * cost;
    });
    const grossProfit = revenue - costOfGoodsSold;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      totalSales,
      totalCollected,
      outstanding,
      totalPurchases,
      totalInvoices: data.invoices.length,
      grossProfit,
      margin,
    };
  }, [data, allPurItems]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, { date: string; sales: number; purchases: number }>();
    data.invoices.forEach((r) => {
      const d = r.created_at.slice(0, 10);
      const cur = byDay.get(d) ?? { date: d, sales: 0, purchases: 0 };
      cur.sales += Number(r.total_amount);
      byDay.set(d, cur);
    });
    data.purchases.forEach((r) => {
      const d = r.created_at.slice(0, 10);
      const cur = byDay.get(d) ?? { date: d, sales: 0, purchases: 0 };
      cur.purchases += Number(r.total_amount);
      byDay.set(d, cur);
    });
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const profitTrend = useMemo(() => {
    if (!data || !allPurItems) return [];
    const avgCostByItem = new Map<string, number>();
    const grouped = new Map<string, any[]>();
    allPurItems.forEach((r: any) => {
      const arr = grouped.get(r.item_id) ?? [];
      arr.push(r);
      grouped.set(r.item_id, arr);
    });
    grouped.forEach((rows, id) => avgCostByItem.set(id, weightedAvgCost(rows)));

    const byDay = new Map<string, number>();
    data.invoiceItems.forEach((r: any) => {
      const d = r.invoices.created_at.slice(0, 10);
      const profit = Number(r.line_total) - Number(r.quantity) * (avgCostByItem.get(r.item_id) ?? 0);
      byDay.set(d, (byDay.get(d) ?? 0) + profit);
    });
    const sorted = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cum = 0;
    return sorted.map(([date, p]) => {
      cum += p;
      return { date, profit: Math.round(cum) };
    });
  }, [data, allPurItems]);

  if (isLoading) return <LoadingBlock />;
  if (!metrics || metrics.totalInvoices === 0 && metrics.totalPurchases === 0)
    return <EmptyState />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Sales Revenue" ur="کل آمدنی" value={fmtRs(metrics.totalSales)} tone="success" big />
        <MetricCard label="Total Purchases Cost" ur="کل خریداری" value={fmtRs(metrics.totalPurchases)} tone="danger" big />
        <MetricCard
          label="Gross Profit"
          ur="خالص منافع"
          value={fmtRs(metrics.grossProfit)}
          tone={metrics.grossProfit >= 0 ? "success" : "danger"}
          big
        />
        <MetricCard
          label="Profit Margin"
          ur="منافع کا تناسب"
          value={`${metrics.margin.toFixed(1)}%`}
          tone={metrics.margin >= 0 ? "success" : "danger"}
          icon={metrics.margin >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          big
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Total Invoices" ur="رسیدیں" value={String(metrics.totalInvoices)} />
        <MetricCard label="Amount Collected" ur="وصول شدہ" value={fmtRs(metrics.totalCollected)} tone="success" />
        <MetricCard label="Outstanding from Customers" ur="بقایا" value={fmtRs(metrics.outstanding)} tone="danger" />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Sales vs Purchases — فروخت بمقابلہ خریداری</h3>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: Math.max(chartData.length * 60, 320) }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtRs(Number(v))} />
                <Legend />
                <Bar dataKey="sales" name="Sales" fill={GREEN} />
                <Bar dataKey="purchases" name="Purchases" fill={RED} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Cumulative Profit — مجموعی منافع</h3>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: Math.max(profitTrend.length * 60, 320) }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={profitTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtRs(Number(v))} />
                <Line type="monotone" dataKey="profit" stroke={GREEN} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground">
        Period: {from} → {to}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  ur,
  value,
  tone,
  big,
  icon,
}: {
  label: string;
  ur: string;
  value: string;
  tone?: "success" | "danger";
  big?: boolean;
  icon?: React.ReactNode;
}) {
  const color =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="urdu text-xs text-muted-foreground">{ur}</div>
      <div className={`${big ? "text-2xl" : "text-xl"} font-bold mt-2 flex items-center gap-2 ${color}`}>
        {icon} {value}
      </div>
    </Card>
  );
}

// ---------- TAB 2: ITEMS ----------

function ItemsTab({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const { data: range, isLoading: l1 } = useRangeData(fromIso, toIso);
  const { data: allPur, isLoading: l2 } = useAllPurchaseItems();
  const { data: allInv, isLoading: l3 } = useAllInvoiceItems();

  const { data: items } = useQuery({
    queryKey: ["reports-items-list"],
    queryFn: async () =>
      (await supabase.from("items").select("id, name_en, name_ur, unit")).data ?? [],
  });
  const { data: stock } = useQuery({
    queryKey: ["reports-stock"],
    queryFn: async () => (await supabase.from("stock").select("item_id, quantity")).data ?? [],
  });

  const rows = useMemo(() => {
    if (!items || !range || !allPur || !allInv) return [];
    const stockMap = new Map((stock ?? []).map((s) => [s.item_id, Number(s.quantity)]));
    const purByItem = new Map<string, any[]>();
    allPur.forEach((r: any) => {
      const a = purByItem.get(r.item_id) ?? [];
      a.push(r);
      purByItem.set(r.item_id, a);
    });
    const salesByItem = new Map<string, any[]>();
    allInv.forEach((r: any) => {
      const a = salesByItem.get(r.item_id) ?? [];
      a.push(r);
      salesByItem.set(r.item_id, a);
    });

    return items.map((it) => {
      const purs = purByItem.get(it.id) ?? [];
      const allSales = salesByItem.get(it.id) ?? [];
      const { finalAvg: avgCost, batches } = computeStockAwareAvg(purs, allSales);
      const sales = range.invoiceItems.filter((r: any) => r.item_id === it.id);
      const soldQty = sales.reduce((s, r: any) => s + Number(r.quantity), 0);
      const revenue = sales.reduce((s, r: any) => s + Number(r.line_total), 0);
      const avgSell = soldQty > 0 ? revenue / soldQty : 0;
      const profit = revenue - soldQty * avgCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: it.id,
        nameEn: it.name_en,
        nameUr: it.name_ur,
        unit: it.unit,
        stock: stockMap.get(it.id) ?? 0,
        avgCost,
        avgSell,
        profitPerUnit: avgSell - avgCost,
        soldQty,
        revenue,
        profit,
        margin,
        batches,
      };
    });
  }, [items, range, allPur, allInv, stock]);

  if (l1 || l2 || l3) return <LoadingBlock />;
  if (rows.length === 0) return <EmptyState msg="No items defined" />;

  const chartData = rows.map((r) => ({ name: r.nameEn, profit: Math.round(r.profit) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <ItemCard key={r.id} row={r} />
        ))}
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Profit by Item — اشیاء کا منافع</h3>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: Math.max(chartData.length * 80, 320) }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtRs(Number(v))} />
                <Bar dataKey="profit" name="Profit">
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? GREEN : RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ItemCard({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const profitable = row.profit >= 0;
  return (
    <Card className={`p-4 border-l-4 ${profitable ? "border-l-success" : "border-l-destructive"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-lg">
            {row.nameEn} <span className="urdu text-sm text-muted-foreground">{row.nameUr}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Current Stock: {row.stock.toLocaleString()} {row.unit}
          </div>
        </div>
        <div className={`text-right ${profitable ? "text-success" : "text-destructive"}`}>
          <div className="text-xs">Profit</div>
          <div className="font-bold">{fmtRs(row.profit)}</div>
          <div className="text-xs">{row.margin.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="bg-muted/40 p-2 rounded">
          <div className="text-xs text-muted-foreground">Avg Buy</div>
          <div className="font-medium">{fmtRs(row.avgCost)}</div>
        </div>
        <div className="bg-muted/40 p-2 rounded">
          <div className="text-xs text-muted-foreground">Avg Sell</div>
          <div className="font-medium">{fmtRs(row.avgSell)}</div>
        </div>
        <div className="bg-muted/40 p-2 rounded">
          <div className="text-xs text-muted-foreground">Profit / Unit</div>
          <div className={`font-medium ${row.profitPerUnit >= 0 ? "text-success" : "text-destructive"}`}>
            {fmtRs(row.profitPerUnit)}
          </div>
        </div>
        <div className="bg-muted/40 p-2 rounded">
          <div className="text-xs text-muted-foreground">Units Sold</div>
          <div className="font-medium">
            {row.soldQty.toLocaleString()} {row.unit}
          </div>
        </div>
        <div className="bg-muted/40 p-2 rounded col-span-2">
          <div className="text-xs text-muted-foreground">Revenue</div>
          <div className="font-medium">{fmtRs(row.revenue)}</div>
        </div>
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-between">
            Purchase batches ({row.batches.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {row.batches.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">No purchase history</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1">Date</th>
                    <th>Supplier</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit Cost</th>
                    <th className="text-right">Running Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {row.batches.map((b: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-1">{b.date}</td>
                      <td>{b.supplier}</td>
                      <td className="text-right">{b.qty.toLocaleString()}</td>
                      <td className="text-right">{fmtRs(b.unitCost)}</td>
                      <td className="text-right font-medium">{fmtRs(b.avgAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------- TAB 3: CUSTOMERS ----------

function CustomersTab({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const { data: range, isLoading } = useRangeData(fromIso, toIso);
  const { data: customers } = useQuery({
    queryKey: ["reports-customers-list"],
    queryFn: async () => (await supabase.from("customers").select("id, name")).data ?? [],
  });

  const rows = useMemo(() => {
    if (!range || !customers) return [];
    const map = new Map<string, { id: string; name: string; orders: number; total: number; paid: number; last: string | null }>();
    customers.forEach((c) => map.set(c.id, { id: c.id, name: c.name, orders: 0, total: 0, paid: 0, last: null }));
    range.invoices.forEach((inv) => {
      const cur = map.get(inv.customer_id);
      if (!cur) return;
      cur.orders += 1;
      cur.total += Number(inv.total_amount);
      cur.paid += Number(inv.paid_amount);
      if (!cur.last || inv.created_at > cur.last) cur.last = inv.created_at;
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, outstanding: r.total - r.paid }))
      .filter((r) => r.orders > 0)
      .sort((a, b) => b.total - a.total);
  }, [range, customers]);

  if (isLoading) return <LoadingBlock />;
  if (rows.length === 0) return <EmptyState />;

  const top10 = rows.slice(0, 10).map((r) => ({ name: r.name, total: Math.round(r.total) }));
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Top 10 Customers — اعلیٰ گاہک</h3>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: Math.max(top10.length * 90, 320) }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtRs(Number(v))} />
                <Bar dataKey="total" name="Purchased" fill={GREEN} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Customer</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Total Bought</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Outstanding</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.name}</td>
                  <td className="text-right">{r.orders}</td>
                  <td className="text-right">{fmtRs(r.total)}</td>
                  <td className="text-right text-success">{fmtRs(r.paid)}</td>
                  <td className={`text-right font-medium ${r.outstanding > 0 ? "text-destructive" : ""}`}>
                    {fmtRs(r.outstanding)}
                  </td>
                  <td>{r.last ? new Date(r.last).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-3 text-right font-semibold">
                  Total Outstanding:
                </td>
                <td className="text-right font-bold text-destructive">{fmtRs(totalOutstanding)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------- TAB 4: SUPPLIERS ----------

function SuppliersTab({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const { data: range, isLoading } = useRangeData(fromIso, toIso);
  const { data: suppliers } = useQuery({
    queryKey: ["reports-suppliers-list"],
    queryFn: async () => (await supabase.from("suppliers").select("id, name")).data ?? [],
  });

  const rows = useMemo(() => {
    if (!range || !suppliers) return [];
    const map = new Map<string, { id: string; name: string; orders: number; total: number; paid: number; last: string | null }>();
    suppliers.forEach((s) => map.set(s.id, { id: s.id, name: s.name, orders: 0, total: 0, paid: 0, last: null }));
    range.purchases.forEach((p) => {
      const cur = map.get(p.supplier_id);
      if (!cur) return;
      cur.orders += 1;
      cur.total += Number(p.total_amount);
      cur.paid += Number(p.paid_amount);
      if (!cur.last || p.created_at > cur.last) cur.last = p.created_at;
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, weOwe: r.total - r.paid }))
      .filter((r) => r.orders > 0)
      .sort((a, b) => b.total - a.total);
  }, [range, suppliers]);

  if (isLoading) return <LoadingBlock />;
  if (rows.length === 0) return <EmptyState />;

  const top10 = rows.slice(0, 10).map((r) => ({ name: r.name, total: Math.round(r.total) }));
  const totalOwed = rows.reduce((s, r) => s + r.weOwe, 0);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Top Suppliers — سپلائر پر خرچ</h3>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: Math.max(top10.length * 90, 320) }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtRs(Number(v))} />
                <Bar dataKey="total" name="Spent" fill={RED} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Supplier</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Total Spent</th>
                <th className="text-right">Paid</th>
                <th className="text-right">We Owe</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.name}</td>
                  <td className="text-right">{r.orders}</td>
                  <td className="text-right">{fmtRs(r.total)}</td>
                  <td className="text-right text-success">{fmtRs(r.paid)}</td>
                  <td className={`text-right font-medium ${r.weOwe > 0 ? "text-destructive" : ""}`}>
                    {fmtRs(r.weOwe)}
                  </td>
                  <td>{r.last ? new Date(r.last).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-3 text-right font-semibold">
                  Total We Owe:
                </td>
                <td className="text-right font-bold text-destructive">{fmtRs(totalOwed)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
