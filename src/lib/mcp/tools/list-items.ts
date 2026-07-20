import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_items",
  title: "List items and prices",
  description: "List catalog items (oil, ghee, sugar, rice, flour, etc.) with unit and latest price.",
  inputSchema: {
    search: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    let q = sb.from("items").select("id, name_en, name_ur, unit, low_stock_threshold").order("name_en");
    if (search) q = q.or(`name_en.ilike.%${search}%,name_ur.ilike.%${search}%`);
    const { data: items, error } = await q;
    if (error) return errorResult(error.message);

    const ids = (items ?? []).map((i) => i.id);
    const priceMap = new Map<string, number>();
    if (ids.length) {
      const { data: prices } = await sb
        .from("item_prices")
        .select("item_id, price, created_at")
        .in("item_id", ids)
        .order("created_at", { ascending: false });
      for (const p of prices ?? []) {
        if (!priceMap.has(p.item_id)) priceMap.set(p.item_id, Number(p.price));
      }
    }
    return jsonResult((items ?? []).map((i) => ({ ...i, current_price: priceMap.get(i.id) ?? null })));
  },
});
