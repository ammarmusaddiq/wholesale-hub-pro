import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Settings2, History } from "lucide-react";

export const Route = createFileRoute("/_app/stock")({ component: StockPage });

function StockPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["stock"],
    queryFn: async () => (await supabase.from("stock").select("*, items(name_en, name_ur, unit, low_stock_threshold)")).data ?? [],
  });

  const sorted = (data ?? []).slice().sort((a: any, b: any) => (a.items?.name_en ?? "").localeCompare(b.items?.name_en ?? ""));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Stock Levels <span className="urdu text-base text-muted-foreground">/ اسٹاک</span></h1>
      <div className="grid sm:grid-cols-2 gap-4">
        {sorted.map((s: any) => {
          const qty = Number(s.quantity);
          const thr = Number(s.items?.low_stock_threshold ?? 0);
          const tone = qty < thr ? "destructive" : qty < thr * 2 ? "warning" : "success";
          const toneCls = tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30" :
                          tone === "warning" ? "bg-warning/10 text-warning border-warning/40" :
                          "bg-success/10 text-success border-success/30";
          return (
            <Card key={s.item_id} className={`p-4 border-2 ${toneCls}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-foreground">{s.items?.name_en}</div>
                  <div className="urdu text-xs text-muted-foreground">{s.items?.name_ur}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{qty.toLocaleString()} <span className="text-sm font-normal">{s.items?.unit}</span></div>
                  <div className="text-xs text-muted-foreground">min {thr}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <HistoryDialog itemId={s.item_id} name={s.items?.name_en} />
                {isAdmin && <AdjustDialog itemId={s.item_id} name={s.items?.name_en} onDone={() => qc.invalidateQueries({ queryKey: ["stock"] })} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AdjustDialog({ itemId, name, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const submit = async () => {
    const c = Number(change); if (!c) { toast.error("Enter change"); return; }
    const { error } = await supabase.rpc("adjust_stock", { p_item_id: itemId, p_change: c, p_reason: reason || "manual" });
    if (error) { toast.error(error.message); return; }
    toast.success("Stock adjusted"); setOpen(false); setChange(""); setReason(""); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5 mr-1" /> Adjust</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust Stock — {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Change (+ to add, − to remove)</Label><Input type="number" value={change} onChange={(e) => setChange(e.target.value)} /></div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged, recount" /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Apply</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ itemId, name }: any) {
  const { data } = useQuery({
    queryKey: ["stock-mv", itemId],
    queryFn: async () => (await supabase.from("stock_movements").select("*").eq("item_id", itemId).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><History className="h-3.5 w-3.5 mr-1" /> History</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Stock Movement — {name}</DialogTitle></DialogHeader>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {data?.length === 0 && <p className="text-sm text-muted-foreground">No movements.</p>}
          {data?.map((m) => (
            <div key={m.id} className="flex justify-between p-2 border-b text-sm">
              <div>
                <span className={Number(m.change) > 0 ? "text-success font-medium" : "text-destructive font-medium"}>{Number(m.change) > 0 ? "+" : ""}{m.change}</span>
                <span className="text-muted-foreground ml-2">{m.reason}</span>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
