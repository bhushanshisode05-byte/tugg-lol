import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Shell } from "./Shell";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Shell>
      <div role="alert" className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold">This page didn't load.</h1>
        <p className="mt-2 text-muted-foreground">{error instanceof Error ? error.message : "Something went wrong."}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Try again</button>
      </div>
    </Shell>
  );
}

export function NotFoundBlock({ text = "Nothing here." }: { text?: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold">{text}</h1>
        <a href="/" className="mt-4 inline-block text-primary underline">Back to all matchups</a>
      </div>
    </Shell>
  );
}
