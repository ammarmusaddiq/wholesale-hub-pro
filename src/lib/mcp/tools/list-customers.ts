import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "List customers",
  description:
    "List customers with optional name/phone search. Returns id, name, phone, address, and current balance.",
  inputSchema: {
    search: z.string().optional().describe("Case-insensitive match on name or phone."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    let q = sb.from("customers").select("id, name, phone, address, current_balance").order("name").limit(limit ?? 50);
    if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult(data);
  },
});
