import { useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { contactSchema } from "@/lib/support-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const ts = useRef<TurnstileHandle>(null);
  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setReply("");
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const parsed = contactSchema.safeParse(values);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message || "Check your details.");
          return;
        }
        if (!token) {
          setError("Please complete the security check.");
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/public/support/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...parsed.data, turnstileToken: token }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Support unavailable.");
          setReply(data.reply);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Message could not be sent.");
        } finally {
          ts.current?.reset();
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-2">
        <span>Your name</span>
        <Input name="name" required maxLength={100} autoComplete="name" />
      </label>
      <label className="block space-y-2">
        <span>Email</span>
        <Input name="email" type="email" required maxLength={255} autoComplete="email" />
      </label>
      <label className="block space-y-2">
        <span>Message</span>
        <Textarea name="message" required maxLength={3000} rows={6} />
      </label>
      <label className="block space-y-2">
        <span>
          Stripe checkout reference <span className="text-muted-foreground">(optional)</span>
        </span>
        <Input name="sessionId" maxLength={200} placeholder="cs_…" />
      </label>
      <p className="text-sm text-muted-foreground">
        Messages and replies are stored privately. Do not include card numbers or passwords. For
        payment errors, use the email entered at checkout.
      </p>
      <Turnstile ref={ts} action={TURNSTILE_ACTIONS.contact} onToken={setToken} />
      <Button type="submit" disabled={busy || !token}>
        {busy ? "Sending…" : "Send message"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {reply && (
        <section aria-label="Support reply" className="border-t border-border py-6">
          <h2 className="mb-3 text-xl font-bold">Tugg’s reply</h2>
          <MessageResponse>{reply}</MessageResponse>
        </section>
      )}
    </form>
  );
}
