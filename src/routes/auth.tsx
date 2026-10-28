import { createFileRoute, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/policies";
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      ...pageHead("Owner sign in", "Sign in to private Tugg owner records.").meta,
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Auth,
});
function Auth() {
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [router.state.location.href]);
  async function login(provider: "google" | "lovable") {
    setError("");
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.redirected) {
      setSignedIn(true);
      await router.invalidate();
      await navigate({ to: "/admin" });
    }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl font-extrabold">Tugg owner access</h1>
      <p className="mt-4 text-muted-foreground">
        Only the configured owner can read these records. Public signup is closed.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {signedIn ? (
          <>
            <Button onClick={() => navigate({ to: "/admin" })}>Open owner records</Button>
            <Button
              variant="outline"
              onClick={async () => {
                await queryClient.cancelQueries();
                queryClient.clear();
                await supabase.auth.signOut();
                setSignedIn(false);
                await navigate({ to: "/auth", replace: true });
              }}
            >
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => login("google")}>Sign in with Google</Button>
            <Button variant="outline" onClick={() => login("lovable")}>
              Sign in with Lovable
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
