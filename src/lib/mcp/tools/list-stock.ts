import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_stock",
  title: "List current stock",
  description: "Current on-hand stock per item. Set low_only=true to only return items at or below their reorder level.",
  inputSchema: {
    low_only: z.boolean().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ low_only }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("stock")
      .select("item_id, quantity, reorder_level, items(name, name_ur, unit)")
      .order("quantity");
    if (error) return errorResult(error.message);
    const rows = low_only
      ? (data ?? []).filter((r) => r.reorder_level != null && (r.quantity ?? 0) <= (r.reorder_level ?? 0))
      : data ?? [];
    return jsonResult(rows);
  },
});
