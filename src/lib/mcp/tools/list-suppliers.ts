import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauth, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "list_suppliers",
  title: "List suppliers",
  description: "List suppliers with current balance owed.",
  inputSchema: {
    search: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    const sb = supabaseForUser(ctx);
    let q = sb.from("suppliers").select("id, name, phone, address, balance").order("name");
    if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult(data);
  },
});
