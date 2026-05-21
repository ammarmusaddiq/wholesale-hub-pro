import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtRs } from "@/lib/i18n";
import { useState } from "react";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

function ReportsPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">Reports <span className="urdu text-base text-muted-foreground">/ رپورٹس</span></h1>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From / سے</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To / تک</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="sales">Daily Sales</TabsTrigger>
          <TabsTrigger value="items">By Item</TabsTrigger>
          <TabsTrigger value="cust">Customer Dues</TabsTrigger>
          <TabsTrigger value="supp">Supplier Dues</TabsTrigger>
        </TabsList>

        <TabsContent value="sales"><SalesReport from={from} to={to} /></TabsContent>
        <TabsContent value="items"><ItemsReport from={from} to={to} /></TabsContent>
        <TabsContent value="cust"><CustomerDues /></TabsContent>
        <TabsContent value="supp"><SupplierDues /></TabsContent>
      </Tabs>
    </div>
  );
}

function SalesReport({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: async () => {
      const { data } = await supabase.from("invoices")
        .select("created_at, total_amount, paid_amount, invoice_number, customers(name)")
        .gte("created_at", from).lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const total = (data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
  const paid = (data ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);
  return (
    <Card className="p-5 mt-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Invoices" value={String(data?.length ?? 0)} />
        <Stat label="Total Sales" value={fmtRs(total)} />
        <Stat label="Collected" value={fmtRs(paid)} tone="success" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="py-2">Date</th><th>Invoice</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Paid</th></tr></thead>
          <tbody>
            {data?.map((r: any) => (
              <tr key={r.invoice_number} className="border-b">
                <td className="py-2">{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.invoice_number}</td><td>{r.customers?.name}</td>
                <td className="text-right">{fmtRs(r.total_amount)}</td>
                <td className="text-right text-success">{fmtRs(r.paid_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ItemsReport({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["report-items", from, to],
    queryFn: async () => {
      const { data } = await supabase.from("invoice_items")
        .select("quantity, line_total, items(name_en, name_ur, unit), invoices!inner(created_at)")
        .gte("invoices.created_at", from).lte("invoices.created_at", to + "T23:59:59");
      const agg = new Map<string, { name: string; nameUr: string; unit: string; qty: number; total: number }>();
      (data ?? []).forEach((r: any) => {
        const k = r.items?.name_en ?? "—";
        const cur = agg.get(k) ?? { name: k, nameUr: r.items?.name_ur ?? "", unit: r.items?.unit ?? "", qty: 0, total: 0 };
        cur.qty += Number(r.quantity); cur.total += Number(r.line_total);
        agg.set(k, cur);
      });
      return Array.from(agg.values()).sort((a, b) => b.total - a.total);
    },
  });
  return (
    <Card className="p-5 mt-4">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Item</th><th className="text-right">Qty Sold</th><th className="text-right">Revenue</th></tr></thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r.name} className="border-b">
              <td className="py-2">{r.name} <span className="urdu text-xs text-muted-foreground">{r.nameUr}</span></td>
              <td className="text-right">{r.qty.toLocaleString()} {r.unit}</td>
              <td className="text-right font-medium">{fmtRs(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CustomerDues() {
  const { data } = useQuery({
    queryKey: ["report-cust-dues"],
    queryFn: async () => (await supabase.from("customers").select("name, phone, current_balance").gt("current_balance", 0).order("current_balance", { ascending: false })).data ?? [],
  });
  const total = (data ?? []).reduce((s, r) => s + Number(r.current_balance), 0);
  return (
    <Card className="p-5 mt-4">
      <div className="mb-3 text-right font-semibold">Total Outstanding: <span className="text-destructive">{fmtRs(total)}</span></div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Customer</th><th>Phone</th><th className="text-right">Balance</th></tr></thead>
        <tbody>{data?.map((c, i) => <tr key={i} className="border-b"><td className="py-2">{c.name}</td><td>{c.phone}</td><td className="text-right text-destructive font-medium">{fmtRs(c.current_balance)}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function SupplierDues() {
  const { data } = useQuery({
    queryKey: ["report-supp-dues"],
    queryFn: async () => (await supabase.from("suppliers").select("name, phone, current_balance").gt("current_balance", 0).order("current_balance", { ascending: false })).data ?? [],
  });
  const total = (data ?? []).reduce((s, r) => s + Number(r.current_balance), 0);
  return (
    <Card className="p-5 mt-4">
      <div className="mb-3 text-right font-semibold">Total We Owe: <span className="text-warning">{fmtRs(total)}</span></div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Supplier</th><th>Phone</th><th className="text-right">We Owe</th></tr></thead>
        <tbody>{data?.map((c, i) => <tr key={i} className="border-b"><td className="py-2">{c.name}</td><td>{c.phone}</td><td className="text-right text-warning font-medium">{fmtRs(c.current_balance)}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="bg-muted/50 p-3 rounded">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${tone === "success" ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}
