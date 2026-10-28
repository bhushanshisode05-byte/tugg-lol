import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PaymentTestModeBanner />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
            tugg<span className="text-primary">.</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link to="/stats" className="hidden text-muted-foreground hover:text-foreground sm:inline">Stats</Link>
            <Link to="/rules" className="text-muted-foreground hover:text-foreground">Rules</Link>
            <Link
              to="/create"
              className="rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-pop transition-transform hover:-translate-y-0.5"
            >
              + Create
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Pulls are non-refundable entertainment purchases. No prizes, no payouts. Just bragging rights.</p>
          <div className="flex gap-4">
            <Link to="/rules" className="hover:text-foreground">Rules & refunds</Link>
            <Link to="/stats" className="hover:text-foreground">Stats</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
