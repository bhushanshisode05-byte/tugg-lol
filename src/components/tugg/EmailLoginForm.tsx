import { useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "./PasswordField";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { emailAuthSchema, type EmailAuthInput } from "@/lib/email-auth-schema";
import { emailSignIn } from "@/lib/email-auth.functions";
import { authReference } from "@/lib/auth-diagnostics";

export function EmailLoginForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<EmailAuthInput["operation"]>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string | undefined>();
  const challenge = useRef<TurnstileHandle>(null);
  const signIn = useServerFn(emailSignIn);
  function changeMode(next: EmailAuthInput["operation"]) { setMode(next); setToken(null); setMessage(""); setError(""); setReference(undefined); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError(""); setReference(undefined);
    const parsed = emailAuthSchema.safeParse({ operation: mode, email, password, turnstileToken: token });
    if (!parsed.success) { setError(mode === "password" ? "Enter a valid email, a password of at least 12 characters, and complete the security check." : "Enter a valid email and complete the security check."); return; }
    setPending(true);
    try {
      const result = await signIn({ data: parsed.data });
      if (!result.ok) { setError(result.message); setReference(authReference(result.reason)); return; }
      if (result.session) {
        const { error: sessionError } = await supabase.auth.setSession(result.session);
        if (sessionError) { setError("Unable to sign in. Please try again."); return; }
        setPassword(""); await onSignedIn();
      } else setMessage(result.message);
    } catch { setError("Unable to complete this request. Please try again."); }
    finally { setPending(false); challenge.current?.reset(); setToken(null); }
  }
  return <form onSubmit={submit} className="space-y-4" aria-label="Email sign in" aria-busy={pending}>
    <div className="space-y-2"><Label htmlFor="owner-email">Email address</Label><Input id="owner-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} className="h-12 text-base" /></div>
    {mode === "password" && <PasswordField id="owner-password" label="Password" value={password} onChange={setPassword} />}
    {mode === "password" && <Button type="button" variant="link" className="h-auto px-0" disabled={pending} onClick={() => changeMode("reset")}>Forgot password?</Button>}
    <Turnstile key={mode} ref={challenge} action={mode === "password" ? TURNSTILE_ACTIONS.login : mode === "reset" ? TURNSTILE_ACTIONS.passwordReset : TURNSTILE_ACTIONS.emailLink} onToken={setToken} />
    <Button type="submit" disabled={pending || !token} className="min-h-12 w-full">{pending ? "Please wait…" : mode === "password" ? "Sign in with email" : mode === "reset" ? "Send password reset link" : "Email me a sign-in link"}</Button>
    {mode === "password" ? <Button type="button" variant="outline" className="min-h-12 w-full" disabled={pending} onClick={() => changeMode("link")}>Email me a sign-in link</Button> : <Button type="button" variant="link" className="w-full" disabled={pending} onClick={() => changeMode("password")}>Back to password sign-in</Button>}
    {message && <p role="status" className="text-sm text-foreground">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {error && reference && <p className="text-xs text-muted-foreground">Reference: {reference}</p>}
  </form>;
}