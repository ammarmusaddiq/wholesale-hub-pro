import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_customer",
  title: "Get customer detail",
  description:
    "Get a customer with recent invoices, payments, and ledger entries. Use list_customers first to find the id.",
  inputSchema: {
    customer_id: z.string().uuid().describe("Customer UUID."),
    history_limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id, history_limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const limit = history_limit ?? 20;
    const [c, inv, pay, led] = await Promise.all([
      sb.from("customers").select("*").eq("id", customer_id).maybeSingle(),
      sb.from("invoices").select("id, invoice_number, invoice_date, total, paid, status").eq("customer_id", customer_id).order("invoice_date", { ascending: false }).limit(limit),
      sb.from("payments").select("id, amount, payment_date, method, note").eq("customer_id", customer_id).order("payment_date", { ascending: false }).limit(limit),
      sb.from("ledger").select("id, entry_date, type, amount, note, ref_id").eq("customer_id", customer_id).order("entry_date", { ascending: false }).limit(limit),
    ]);
    if (c.error) return errorResult(c.error.message);
    if (!c.data) return errorResult("Customer not found");
    return jsonResult({
      customer: c.data,
      invoices: inv.data ?? [],
      payments: pay.data ?? [],
      ledger: led.data ?? [],
    });
  },
});
