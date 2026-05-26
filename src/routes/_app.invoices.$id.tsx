import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtRs } from "@/lib/i18n";
import { Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/invoices/$id")({ component: InvoiceView });

function InvoiceView() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items, biz] = await Promise.all([
        supabase.from("invoices").select("*, customers(name, phone, address)").eq("id", id).single(),
        supabase.from("invoice_items").select("*, items(name_en, name_ur, unit)").eq("invoice_id", id),
        supabase.from("business_settings").select("*").eq("id", 1).single(),
      ]);
      return { invoice: inv.data, items: items.data ?? [], business: biz.data };
    },
  });

  if (!data?.invoice) return <div className="p-8 text-center">Loading…</div>;
  const inv = data.invoice as any;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex justify-between items-center no-print">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print / پرنٹ</Button>
      </div>

      <div className="bg-card text-card-foreground border rounded-lg p-6 md:p-10 shadow-sm print:shadow-none print:border-0">
        <div className="text-center pb-4 border-b">
          <h1 className="text-3xl font-bold">{data.business?.business_name}</h1>
          {data.business?.address && <p className="text-sm text-muted-foreground">{data.business.address}</p>}
          {data.business?.phone && <p className="text-sm text-muted-foreground">{data.business.phone}</p>}
        </div>

        <div className="flex flex-wrap justify-between gap-3 my-5">
          <div>
            <div className="text-xs text-muted-foreground">Invoice / رسید نمبر</div>
            <div className="text-xl font-bold">{inv.invoice_number}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Date / تاریخ</div>
            <div className="font-medium">{new Date(inv.created_at).toLocaleString()}</div>
          </div>
        </div>

        <div className="mb-5">
          <div className="text-xs text-muted-foreground">Customer / گاہک</div>
          <div className="font-semibold text-lg">{inv.customers?.name}</div>
          {inv.customers?.phone && <div className="text-sm">{inv.customers.phone}</div>}
        </div>

        <table className="w-full text-sm border-y">
          <thead className="bg-muted/50">
            <tr>
              <th className="py-2 px-2 text-left">Item / آئٹم</th>
              <th className="py-2 px-2 text-right">Qty</th>
              <th className="py-2 px-2 text-right">Price</th>
              <th className="py-2 px-2 text-right">Labor/Unit</th>
              <th className="py-2 px-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="py-2 px-2">
                  <div>{it.items?.name_en}</div>
                  <div className="urdu text-xs text-muted-foreground">{it.items?.name_ur}</div>
                </td>
                <td className="py-2 px-2 text-right">{Number(it.quantity)} {it.items?.unit}</td>
                <td className="py-2 px-2 text-right">{fmtRs(it.unit_price)}</td>
                <td className="py-2 px-2 text-right">{fmtRs(it.labor_per_unit ?? 0)}</td>
                <td className="py-2 px-2 text-right font-medium">{fmtRs(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(() => {
          const laborTotal = (data.items as any[]).reduce((s, it) => s + Number(it.labor_total ?? 0), 0);
          const itemsSub = Number(inv.total_amount) - laborTotal;
          return (
            <div className="mt-5 space-y-1 ml-auto max-w-xs">
              <Row label="Items Subtotal / اشیاء" value={fmtRs(itemsSub)} />
              <Row label="Labor Charges / مزدوری" value={fmtRs(laborTotal)} />
              <div className="border-t pt-2">
                <Row label="Grand Total / کل" value={fmtRs(inv.total_amount)} bold />
              </div>
              <Row label="Paid / ادا شدہ" value={fmtRs(inv.paid_amount)} tone="success" />
              <div className="border-t pt-2">
                <Row label="Balance Due / بقایا" value={fmtRs(Number(inv.total_amount) - Number(inv.paid_amount))} bold tone={inv.status === "paid" ? "success" : "destructive"} />
              </div>
            </div>
          );
        })()}

        <div className="text-center text-xs text-muted-foreground mt-8 pt-4 border-t">
          Thank you for your business / آپ کی کاروبار کا شکریہ
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold = false, tone }: { label: string; value: string; bold?: boolean; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`${bold ? "font-bold text-lg" : ""} ${cls}`}>{value}</span>
    </div>
  );
}
