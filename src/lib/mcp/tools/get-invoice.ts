import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_invoice",
  title: "Get invoice detail",
  description: "Get a single invoice with its line items and payments.",
  inputSchema: {
    invoice_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ invoice_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("invoices")
      .select("*, customers(name, phone), invoice_items(*, items(name, unit))")
      .eq("id", invoice_id)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Invoice not found");
    return jsonResult(data);
  },
});
