import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_invoice",
  title: "Get invoice detail",
  description: "Get a single invoice with its line items, customer, and payments.",
  inputSchema: {
    invoice_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ invoice_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const [inv, pay] = await Promise.all([
      sb
        .from("invoices")
        .select("*, customers(name, phone), invoice_items(*, items(name_en, name_ur, unit))")
        .eq("id", invoice_id)
        .maybeSingle(),
      sb
        .from("customer_payments")
        .select("id, amount, created_at, method, note")
        .eq("invoice_id", invoice_id)
        .order("created_at", { ascending: false }),
    ]);
    if (inv.error) return errorResult(inv.error.message);
    if (!inv.data) return errorResult("Invoice not found");
    return jsonResult({ ...inv.data, payments: pay.data ?? [] });
  },
});
