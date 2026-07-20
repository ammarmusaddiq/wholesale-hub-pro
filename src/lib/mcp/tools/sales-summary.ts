import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "sales_summary",
  title: "Sales summary",
  description:
    "Totals for invoices in a date range (YYYY-MM-DD). Returns invoice count, total sales, total collected, and outstanding.",
  inputSchema: {
    from_date: z.string().describe("Inclusive start date, YYYY-MM-DD."),
    to_date: z.string().describe("Inclusive end date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("invoices")
      .select("total, paid")
      .gte("invoice_date", from_date)
      .lte("invoice_date", to_date);
    if (error) return errorResult(error.message);
    const rows = data ?? [];
    const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const paid = rows.reduce((s, r) => s + Number(r.paid ?? 0), 0);
    return jsonResult({
      from_date,
      to_date,
      invoice_count: rows.length,
      total_sales: total,
      total_collected: paid,
      outstanding: total - paid,
    });
  },
});
