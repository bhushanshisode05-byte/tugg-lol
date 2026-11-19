import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/tugg/Shell";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Rope } from "@/components/tugg/Rope";
import { createMatchupCheckout, getCreationStatus } from "@/lib/tugg.functions";
import { Turnstile } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { SideImageField, type DraftSideImage } from "@/components/tugg/SideImageField";
import { SideAvatar } from "@/components/tugg/SideAvatar";

import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
import { getPaymentStatus } from "@/lib/payments.functions";
import { BillingFields, emptyBilling } from "@/components/tugg/BillingFields";
import { billingSchema } from "@/lib/payments/billing";
import { paymentProviderText, paymentStatementText } from "@/lib/payments/copy";
import { openDodoOverlay, type DodoOverlayEvent } from "@/lib/payments/dodo-overlay";
import { useOrderConfirmation } from "@/hooks/use-payment-confirmation";
import { creationConfirmed, creationPhase, type CreationResult } from "@/lib/payments/creation-status";
import { CreationCancelledNote, CreationStatusView } from "@/components/tugg/CreationStatus";

export const Route = createFileRoute("/create")({
  staticData: { sitemap: true },
  validateSearch: (s: Record<string, unknown>): { session_id?: string | undefined } => ({
    session_id: typeof s["session_id"] === "string" ? s["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create a matchup | Tugg" },
      {
        name: "description",
        content:
          "Start your own rivalry on Tugg for $9, or $29 to be featured on the homepage for 7 days. Every matchup is moderated automatically.",
      },
      { property: "og:title", content: "Create a Tugg matchup" },
      {
        property: "og:description",
        content: "Pick two sides, choose colors and emoji, and let the world pull.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatePage,
});

const CATS = [
  "Tech",
  "Brands",
  "Cities",
  "Countries",
  "Sports",
  "Food",
  "Entertainment",
  "Other",
] as const;
type SideIn = { name: string; emoji: string; color: string };

const ORDER_ID = /^[0-9a-f-]{36}$/i;

/** The form and, after checkout, the stored outcome of the new matchup, checked with the shared post-payment poller. */
function CreatePage() {
  const { session_id } = Route.useSearch();
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getCreationStatus);
  const returned = session_id && ORDER_ID.test(session_id) ? session_id : undefined;
  const confirm = useOrderConfirmation<CreationResult>((id) => fetchStatus({ data: { sessionId: id } }), { phaseFor: creationPhase, confirmed: creationConfirmed, initialOrderId: returned });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (returned) confirm.track(returned); }, [returned]); // eslint-disable-line react-hooks/exhaustive-deps
  const phase = confirm.state.phase;
  const showStatus = phase !== "idle" && phase !== "cancelled";
  return (
    <Shell>
      {phase === "cancelled" && !dismissed && <CreationCancelledNote onDismiss={() => setDismissed(true)} />}
      <CreationStatusView state={confirm.state} onCheckAgain={confirm.checkAgain} />
      {/* Kept mounted (only hidden) while checking, so a closed checkout returns to the buyer's own entries. */}
      <div hidden={showStatus}>
        <CreateForm
          onCheckoutOpened={(orderId) => { setDismissed(false); confirm.track(orderId); }}
          onCheckoutEvent={(orderId, event) => {
            confirm.track(orderId);
            confirm.signal(event);
            // A sign of payment: keep the order in the address so a reload carries on checking.
            if (event !== "closed" && session_id !== orderId) void navigate({ to: "/create", search: { session_id: orderId }, replace: true });
          }}
        />
      </div>
    </Shell>
  );
}

function CreateForm({ onCheckoutOpened, onCheckoutEvent }: { onCheckoutOpened: (orderId: string) => void; onCheckoutEvent: (orderId: string, event: DodoOverlayEvent) => void }) {
  const checkout = useServerFn(createMatchupCheckout);
  const getPayments = useServerFn(getPaymentStatus);
  const [ready, setReady] = useState(false);
  const [provider,setProvider] = useState("dodo");
  const [message,setMessage] = useState("Dodo checkout is not configured yet. No payment has been taken.");
  const [billing,setBilling] = useState(emptyBilling);
  useEffect(() => {
    getPayments()
      .then((s) => { setReady(s.ready && !s.paused); setProvider(s.provider); setMessage(s.paused ? "Payments are paused right now." : s.message); })
      .catch(() => setReady(false));
  }, [getPayments]);
  const [a, setA] = useState<SideIn>({ name: "", emoji: "🔥", color: "#e8ff3a" });
  const [b, setB] = useState<SideIn>({ name: "", emoji: "🧊", color: "#ff2e88" });
  const [images, setImages] = useState<{ a?: DraftSideImage; b?: DraftSideImage }>({});
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("Other");
  const [tier, setTier] = useState<"standard" | "featured">("standard");
  const [pay, setPay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const autoTitle = a.name && b.name ? `${a.name} vs ${b.name}` : "";
  const finalTitle = title || autoTitle;
  const ok =
    a.name.trim() &&
    b.name.trim() &&
    finalTitle.length >= 3 &&
    (!images.a || images.a.rights) &&
    (!images.b || images.b.rights);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-5xl font-extrabold">Start a rivalry</h1>
      <p className="mt-2 text-muted-foreground">
        Brands, places, teams, foods, ideas. No private people, politics, hate or adult stuff.
        Rejected matchups are refunded automatically. {paymentProviderText(provider)}
      </p>

      {pay ? (
        <p className="mt-8 text-muted-foreground">Opening secure checkout…</p>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Side A", a, setA, "a"],
                ["Side B", b, setB, "b"],
              ] as const
            ).map(([label, v, set, key]) => (
              <fieldset key={label} className="rounded-2xl border border-border bg-card p-4">
                <legend className="px-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  {label}
                </legend>
                <input
                  value={v.name}
                  maxLength={40}
                  onChange={(e) => set({ ...v, name: e.target.value })}
                  placeholder="Name"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 font-bold"
                />
                <div className="mt-3 flex gap-3">
                  <input
                    value={v.emoji}
                    maxLength={4}
                    onChange={(e) => set({ ...v, emoji: e.target.value })}
                    aria-label="Emoji"
                    className="w-20 rounded-xl border border-input bg-background px-3 py-3 text-center text-xl"
                  />
                  <input
                    type="color"
                    value={v.color}
                    onChange={(e) => set({ ...v, color: e.target.value })}
                    aria-label="Color"
                    className="h-12 w-16 rounded-xl border border-input bg-background"
                  />
                </div>
                {SIDE_IMAGES_ENABLED && (
                  <SideImageField
                    label={label}
                    color={v.color}
                    value={images[key]}
                    onChange={(image) => setImages((prev) => ({ ...prev, [key]: image }))}
                  />
                )}
              </fieldset>
            ))}
          </div>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle || "Title"}
            className="w-full rounded-xl border border-input bg-card px-4 py-3"
          />
          <textarea
            value={desc}
            maxLength={280}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Short description (optional)"
            rows={3}
            className="w-full rounded-xl border border-input bg-card px-4 py-3"
          />
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-full border px-4 py-1.5 text-sm font-bold ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["standard", "$9", "Standard listing"],
                ["featured", "$29", "Featured on the homepage for 7 days"],
              ] as const
            ).map(([t, p, d]) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`rounded-2xl border-2 p-4 text-left ${tier === t ? "border-primary" : "border-border"}`}
              >
                <p className="font-mono text-3xl font-extrabold">{p}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </button>
            ))}
          </div>
          {a.name && b.name && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Preview
              </p>
              <p className="text-xl font-extrabold">
                <SideAvatar side={{ ...a, image_preview: images.a?.preview }} /> {finalTitle}{" "}
                <SideAvatar side={{ ...b, image_preview: images.b?.preview }} />
              </p>
              <Rope
                size="sm"
                a={0}
                b={0}
                sides={[
                  {
                    ...a,
                    image_preview: images.a?.preview,
                    id: "a",
                    position: 0,
                    all_time_cents: 0,
                    wins: 0,
                    current_streak: 0,
                    best_streak: 0,
                  },
                  {
                    ...b,
                    image_preview: images.b?.preview,
                    id: "b",
                    position: 1,
                    all_time_cents: 0,
                    wins: 0,
                    current_streak: 0,
                    best_streak: 0,
                  },
                ]}
              />
            </div>
          )}
          {SIDE_IMAGES_ENABLED && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Optional pictures: JPG, PNG or WebP, up to 5 MB. Use only pictures you have the right
              to use. No identifiable people, minors, sexual or violent content, hate symbols or
              scams. Pictures are checked after payment; rejected submissions are refunded. Pictures
              may be removed after reports.
            </p>
          )}
          {!ready && <p className="text-sm text-muted-foreground">{message}</p>}
          {ready && provider === "payglocal" && <BillingFields value={billing} onChange={setBilling}/>}
          <Turnstile key={attempt} action={TURNSTILE_ACTIONS.matchup} onToken={setToken} />
          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
          <Button
            disabled={!ok || !token || !ready || (provider === "payglocal" && !billingSchema.safeParse(billing).success)}
            onClick={async () => {
              setErr(null);
              setPay(true);
              try {
                const r = await checkout({
                  data: {
                    title: finalTitle,
                    description: desc,
                    category: cat,
                    a,
                    b,
                    tier,
                    ...(provider === "payglocal" ? { billing } : {}),
                    returnUrl: `${window.location.origin}/create`,
                    turnstileToken: token ?? undefined,
                  },
                });
                if ("error" in r) {
                  setErr(r.error);
                  setPay(false);
                  setToken(null);
                  setAttempt((n) => n + 1);
                } else {
                  const destination = new URL(r.url);
                  const orderId = r.orderId;
                  if (provider === "dodo" && orderId && await openDodoOverlay(r.url, r.environment ?? "sandbox", (event) => onCheckoutEvent(orderId, event))) {
                    // The token was spent on this checkout; a fresh check is ready if the buyer closes it and tries again.
                    setPay(false); setToken(null); setAttempt((n) => n + 1);
                    onCheckoutOpened(orderId);
                  } else window.location.assign(destination.toString());
                }
              } catch {
                setErr("Could not open checkout.");
                setPay(false);
                setToken(null);
                setAttempt((n) => n + 1);
              }
            }}
            className="h-auto w-full whitespace-normal py-4 font-display text-xl font-extrabold"
          >
            Pay {tier === "featured" ? "$29" : "$9"} and submit
          </Button>
          <p className="mt-3 text-sm text-foreground" data-payment-descriptor>{paymentStatementText(provider)}</p>
        </div>
      )}
    </div>
  );
}
