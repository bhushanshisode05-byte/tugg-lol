import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/tugg/PasswordField";
import { Turnstile, type TurnstileHandle } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { MIN_PASSWORD_LENGTH, recoveryHash, resetPasswordSchema } from "@/lib/email-auth-schema";
import { resetOwnerPassword } from "@/lib/email-auth.functions";
import { pageHead } from "@/lib/policies";
import { authReference } from "@/lib/auth-diagnostics";

export const Route = createFileRoute("/reset-password")({
  staticData: { sitemap: false },
  head: () => ({ meta: [...pageHead("Reset owner password", "Securely reset your Tugg owner password.").meta, { name: "robots", content: "noindex,nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const challenge = useRef<TurnstileHandle>(null);
  const reset = useServerFn(resetOwnerPassword);
  useEffect(() => {
    setTokenHash(recoveryHash(window.location.hash)); setReady(true);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setReference(undefined);
    const parsed = resetPasswordSchema.safeParse({ password, tokenHash, turnstileToken: token });
    if (password !== confirmation) { setError("Passwords must match."); return; }
    if (!parsed.success) { setError("Use at least 12 characters and complete the security check."); return; }
    setPending(true);
    try {
      const result = await reset({ data: parsed.data });
      if (!result.ok) { setError(result.message); setReference(authReference(result.reason)); }
      else { setDone(true); setPassword(""); setConfirmation(""); setTokenHash(null); }
    } catch { setError("Unable to reset your password. Please try again."); }
    finally { setPending(false); challenge.current?.reset(); setToken(null); }
  }
  return <main className="mx-auto max-w-md px-4 py-12">
    <h1 className="font-display text-3xl font-extrabold">Reset Tugg password</h1>
    {!ready ? <p role="status" className="mt-6 text-muted-foreground">Checking reset link…</p> : done ? <p role="status" className="mt-6">Password updated. Sign in with your new password.</p> : !tokenHash ? <p role="alert" className="mt-6 text-muted-foreground">Open the reset link from your email. If it has expired, request a new one.</p> : <form onSubmit={submit} className="mt-8 space-y-4" aria-label="Reset password" aria-busy={pending}>
      <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} newPassword />
      <PasswordField id="confirm-password" label="Confirm password" value={confirmation} onChange={setConfirmation} newPassword />
      <p className="text-sm text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      <Turnstile ref={challenge} action={TURNSTILE_ACTIONS.passwordUpdate} onToken={setToken} />
      <Button className="min-h-12 w-full" type="submit" disabled={pending || !token}>{pending ? "Updating…" : "Set new password"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {error && reference && <p className="text-xs text-muted-foreground">Reference: {reference}</p>}
    </form>}
    <Button variant="link" className="mt-6 px-0" asChild><Link to="/auth">Back to sign in</Link></Button>
  </main>;
}