import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_stock",
  title: "List current stock",
  description:
    "Current on-hand stock per item. Set low_only=true to only return items at or below their low-stock threshold.",
  inputSchema: {
    low_only: z.boolean().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ low_only }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("stock")
      .select("item_id, quantity, updated_at, items(name_en, name_ur, unit, low_stock_threshold)")
      .order("quantity");
    if (error) return errorResult(error.message);
    const rows = (data ?? []).map((r) => ({
      item_id: r.item_id,
      quantity: Number(r.quantity ?? 0),
      updated_at: r.updated_at,
      name_en: r.items?.name_en,
      name_ur: r.items?.name_ur,
      unit: r.items?.unit,
      low_stock_threshold: r.items?.low_stock_threshold ?? 0,
    }));
    const filtered = low_only ? rows.filter((r) => r.quantity <= r.low_stock_threshold) : rows;
    return jsonResult(filtered);
  },
});
