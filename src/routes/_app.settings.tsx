import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();

  const { data: biz } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await supabase.from("business_settings").select("*").eq("id", 1).single()).data,
  });

  const { data: items } = useQuery({
    queryKey: ["items-settings"],
    queryFn: async () => (await supabase.from("items").select("*").order("name_en")).data ?? [],
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data: profs } = await supabase.from("profiles").select("id, full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      return (profs ?? []).map((p) => ({ ...p, role: roles?.find((r) => r.user_id === p.id)?.role ?? "staff" }));
    },
  });

  const [form, setForm] = useState({ business_name: "", address: "", phone: "" });
  useEffect(() => { if (biz) setForm({ business_name: biz.business_name, address: biz.address ?? "", phone: biz.phone ?? "" }); }, [biz]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  const saveBiz = async () => {
    const { error } = await supabase.from("business_settings").update(form).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Business info saved");
  };

  const updateThreshold = async (id: string, value: string) => {
    const v = Number(value); if (isNaN(v)) return;
    await supabase.from("items").update({ low_stock_threshold: v }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["items-settings"] });
  };

  const changeRole = async (userId: string, role: "admin" | "staff") => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role });
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Settings <span className="urdu text-base text-muted-foreground">/ ترتیبات</span></h1>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Business Info / کاروبار کی معلومات</h2>
        <div><Label>Business Name</Label><Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
        <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <Button onClick={saveBiz}>Save</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Low Stock Thresholds / کم اسٹاک حد</h2>
        {items?.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium text-sm">{it.name_en} <span className="urdu text-xs text-muted-foreground">{it.name_ur}</span></div>
            </div>
            <Input type="number" defaultValue={String(it.low_stock_threshold)} onBlur={(e) => updateThreshold(it.id, e.target.value)} className="w-28" />
            <span className="text-xs text-muted-foreground w-10">{it.unit}</span>
          </div>
        ))}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Users & Roles / صارفین</h2>
        <p className="text-xs text-muted-foreground">New users sign up via the login page. You can promote staff to admin here.</p>
        {users?.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 py-2 border-b">
            <div>
              <div className="font-medium text-sm">{u.full_name || u.id.slice(0, 8)}</div>
              <div className="text-xs text-muted-foreground">{u.role}</div>
            </div>
            <Select value={u.role} onValueChange={(v: any) => changeRole(u.id, v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </Card>
    </div>
  );
}
