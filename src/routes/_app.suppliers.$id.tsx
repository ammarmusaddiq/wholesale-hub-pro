import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtRs } from "@/lib/i18n";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers/$id")({ component: SupplierDetail });

function SupplierDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const [sup, ledger] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        supabase.from("supplier_ledger").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
      ]);
      return { supplier: sup.data, ledger: ledger.data ?? [] };
    },
  });

  if (!data?.supplier) return <div className="p-8 text-center">Loading…</div>;
  const s = data.supplier;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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
            <div className={`text-3xl font-bold ${Number(s.current_balance) > 0 ? "text-warning" : "text-success"}`}>{fmtRs(s.current_balance)}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button asChild><Link to="/purchases/new" search={{ supplier: s.id } as any}>+ New Purchase</Link></Button>
          <Button variant="outline" asChild><Link to="/supplier-payments" search={{ supplier: s.id } as any}>Record Payment</Link></Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Ledger / کھاتہ</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Note</th>
                <th className="pr-3 text-right">Paid</th><th className="pr-3 text-right">Purchase</th><th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
              {data.ledger.map((l) => (
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
      </Card>
    </div>
  );
}
