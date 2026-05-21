import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtRs } from "@/lib/i18n";
import { FileText, Wallet, ShoppingCart, AlertTriangle, TrendingUp, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export const Route = createFileRoute("/_app/")({ component: Dashboard });

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const [salesRes, custRes, suppRes, stockRes, invRes] = await Promise.all([
        supabase.from("invoices").select("total_amount").gte("created_at", today.toISOString()),
        supabase.from("customers").select("current_balance"),
        supabase.from("suppliers").select("current_balance"),
        supabase.from("stock").select("quantity, item_id, items(name_en, name_ur, low_stock_threshold, unit)"),
        supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status, created_at, customers(name)").order("created_at", { ascending: false }).limit(5),
      ]);

      const todaySales = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
      const custOwed = (custRes.data ?? []).reduce((s, r) => s + Number(r.current_balance), 0);
      const suppOwed = (suppRes.data ?? []).reduce((s, r) => s + Number(r.current_balance), 0);
      const lowStock = (stockRes.data ?? []).filter((s: any) => Number(s.quantity) < Number(s.items?.low_stock_threshold ?? 0));
      return { todaySales, custOwed, suppOwed, lowStock, recent: invRes.data ?? [] };
    },
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Dashboard <span className="urdu text-base text-muted-foreground">/ ڈیش بورڈ</span></h1>
        <p className="text-sm text-muted-foreground">Overview of today's business</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Today's Sales" labelUr="آج کی فروخت" value={fmtRs(stats?.todaySales)} tone="primary" />
        <StatCard icon={ArrowDownToLine} label="Customers Owe Us" labelUr="گاہکوں سے وصول" value={fmtRs(stats?.custOwed)} tone="success" />
        <StatCard icon={ArrowUpFromLine} label="We Owe Suppliers" labelUr="سپلائر کو ادا" value={fmtRs(stats?.suppOwed)} tone="warning" />
        <StatCard icon={AlertTriangle} label="Low Stock Items" labelUr="کم اسٹاک" value={String(stats?.lowStock.length ?? 0)} tone={stats?.lowStock.length ? "destructive" : "muted"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <QuickAction to="/invoices/new" icon={FileText} en="New Invoice" ur="نئی رسید" />
        <QuickAction to="/payments" icon={Wallet} en="Record Payment" ur="ادائیگی" />
        <QuickAction to="/purchases/new" icon={ShoppingCart} en="Add Stock" ur="اسٹاک شامل" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Invoices <span className="urdu text-sm text-muted-foreground">/ حالیہ رسیدیں</span></h2>
            <Link to="/invoices/new" className="text-sm text-primary hover:underline">+ New</Link>
          </div>
          <div className="space-y-2">
            {stats?.recent.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
            {stats?.recent.map((inv: any) => (
              <Link key={inv.id} to="/invoices/$id" params={{ id: inv.id }} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent">
                <div>
                  <div className="font-medium text-sm">{inv.invoice_number} · {inv.customers?.name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtRs(inv.total_amount)}</div>
                  <div className={`text-xs ${inv.status === "paid" ? "text-success" : inv.status === "partial" ? "text-warning" : "text-destructive"}`}>{inv.status}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Low Stock Alerts <span className="urdu text-sm text-muted-foreground">/ کم اسٹاک</span></h2>
          <div className="space-y-2">
            {stats?.lowStock.length === 0 && <p className="text-sm text-success">All stock levels are healthy ✓</p>}
            {stats?.lowStock.map((s: any) => (
              <div key={s.item_id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/10">
                <div>
                  <div className="font-medium text-sm">{s.items?.name_en}</div>
                  <div className="urdu text-xs text-muted-foreground">{s.items?.name_ur}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-destructive">{Number(s.quantity)} {s.items?.unit}</div>
                  <div className="text-xs text-muted-foreground">min {s.items?.low_stock_threshold}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, labelUr, value, tone }: any) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="urdu text-xs text-muted-foreground">{labelUr}</div>
          <div className="text-2xl font-bold mt-2">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg grid place-items-center ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, en, ur }: any) {
  return (
    <Button asChild variant="outline" className="h-auto py-4 justify-start">
      <Link to={to}>
        <Icon className="h-5 w-5 mr-3 text-primary" />
        <div className="flex flex-col items-start leading-tight">
          <span>{en}</span>
          <span className="urdu text-xs text-muted-foreground">{ur}</span>
        </div>
      </Link>
    </Button>
  );
}
