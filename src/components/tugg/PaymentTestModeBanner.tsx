const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive bg-destructive/20 px-4 py-2 text-center text-sm">
        Checkout isn't live yet. Real payments open once payments go-live is complete.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-primary/40 bg-primary/15 px-4 py-2 text-center text-xs font-semibold">
        Test mode: use card 4242 4242 4242 4242. No real money moves.{" "}
        <a
          href="https://docs.lovable.dev/features/payments#test-and-live-environments"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Read more
        </a>
      </div>
    );
  }
  return null;
}
