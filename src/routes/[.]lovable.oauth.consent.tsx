import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Store } from "lucide-react";

// Minimal typed wrapper for Supabase's beta auth.oauth namespace.
type OAuthDetails = {
  client?: { name?: string; redirect_uris?: string[] } | null;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResp = { data: OAuthDetails | null; error: { message: string } | null };
const oauth = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResp>;
      approveAuthorization: (id: string) => Promise<OAuthResp>;
      denyAuthorization: (id: string) => Promise<OAuthResp>;
    };
  }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } as never });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md p-6 space-y-2">
        <h1 className="text-lg font-semibold">Could not load this authorization request</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? [];

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/30 px-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Connect {clientName}</h1>
          <p className="text-sm text-muted-foreground">
            This lets {clientName} use Harris Traders as you.
          </p>
        </div>

        <div className="text-sm space-y-2">
          <p className="font-medium">What {clientName} can do:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Call this app's enabled tools while you are signed in.</li>
            <li>Read the same data you can see (customers, items, invoices, stock, suppliers).</li>
          </ul>
          {scopes.length > 0 && (
            <p className="text-xs text-muted-foreground pt-2">
              Requested identity scopes: {scopes.join(", ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            This does not bypass Harris Traders' permissions or backend policies.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            Approve
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Cancel connection
          </Button>
        </div>
      </Card>
    </main>
  );
}
