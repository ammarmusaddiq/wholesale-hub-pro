import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List invoices, optionally filtered by customer or date range (YYYY-MM-DD).",
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
      .select("id, invoice_number, invoice_date, total, paid, status, customer_id, customers(name)")
      .order("invoice_date", { ascending: false })
      .limit(limit ?? 50);
    if (customer_id) q = q.eq("customer_id", customer_id);
    if (from_date) q = q.gte("invoice_date", from_date);
    if (to_date) q = q.lte("invoice_date", to_date);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult(data);
  },
});
