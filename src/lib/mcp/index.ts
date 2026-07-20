import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCustomersTool from "./tools/list-customers";
import getCustomerTool from "./tools/get-customer";
import listItemsTool from "./tools/list-items";
import listStockTool from "./tools/list-stock";
import listInvoicesTool from "./tools/list-invoices";
import getInvoiceTool from "./tools/get-invoice";
import listSuppliersTool from "./tools/list-suppliers";
import salesSummaryTool from "./tools/sales-summary";

// See tanstack `[.]lovable.oauth.consent` route — issuer must be the direct
// supabase.co host, not the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "harris-traders-mcp",
  title: "Harris Traders",
  version: "0.1.0",
  instructions:
    "Tools for Harris Traders wholesale business (cooking oil, ghee, sugar, rice, flour). Read customers, items, stock, invoices, suppliers, and sales summaries. All calls run as the signed-in user under row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCustomersTool,
    getCustomerTool,
    listItemsTool,
    listStockTool,
    listInvoicesTool,
    getInvoiceTool,
    listSuppliersTool,
    salesSummaryTool,
  ],
});
