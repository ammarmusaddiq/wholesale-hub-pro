import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_items",
  title: "List items and prices",
  description: "List catalog items (oil, ghee, sugar, rice, flour, etc.) with current selling price.",
  inputSchema: {
    search: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    let q = sb.from("items").select("id, name, name_ur, unit, current_price").order("name");
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult(data);
  },
});
