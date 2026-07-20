import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List invoices, optionally filtered by customer or date range (YYYY-MM-DD, applied to created_at).",
  inputSchema: {
    customer_id: z.string().uuid().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id, from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("invoices")
      .select("id, invoice_number, created_at, total_amount, paid_amount, status, customer_id, customers(name)")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (customer_id) q = q.eq("customer_id", customer_id);
    if (from_date) q = q.gte("created_at", from_date);
    if (to_date) q = q.lte("created_at", `${to_date}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult(data);
  },
});
