import * as React from "react";
import { Text, Link, Section, Button } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailFrame, emailLink, emailText, emailButton, EMAIL_COLORS } from "@/lib/email-templates/brand";
import type { EngagementKind } from "./rules";

/** Public facts only (side names, round totals, times). Never another buyer's name, email, display name or shout-out. */
export type EngagementData = {
  title: string; slug: string; round_length?: string;
  a_id: string; a_name: string; b_id: string; b_name: string; a_cents: number; b_cents: number;
  ends_at?: string; leader_id?: string; winner_id?: string; tie?: boolean; next_round?: boolean; streak?: number;
};
export type EngagementMessage = {
  kind: EngagementKind; environment: "sandbox" | "live"; backedSideIds: string[]; data: EngagementData;
  /** Score and end time read at send time (live values for overtaken / closing soon; final values for results). */
  aCents: number; bCents: number; endsAt?: string | null; now: Date; unsubscribeUrl: string;
};

const SITE = "https://tugg.lol";
const clean = (s: unknown, max = 80) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const usdWhole = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function formatTimeLeft(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${part(d, "day")} ${part(h, "hour")}` : part(d, "day");
  if (h > 0) return m > 0 ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
  return mins < 1 ? "less than a minute" : part(m, "minute");
}
export function formatCloseTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

/** Everything the templates need, derived once so subject and body always agree. */
export function engagementFacts(msg: EngagementMessage) {
  const d = msg.data;
  const name = (id?: string) => clean(id === d.a_id ? d.a_name : id === d.b_id ? d.b_name : "");
  const cents = (id?: string) => (id === d.a_id ? msg.aCents : id === d.b_id ? msg.bCents : 0);
  const backed = msg.backedSideIds.filter((id) => id === d.a_id || id === d.b_id);
  const mine = backed.length === 1 ? backed[0] : undefined;
  const other = mine === d.a_id ? d.b_id : d.a_id;
  const left = msg.endsAt ? new Date(msg.endsAt).getTime() - msg.now.getTime() : 0;
  const winner = d.winner_id;
  const backedWinner = !!winner && mine === winner;
  const streak = backedWinner && Number.isInteger(d.streak) && (d.streak as number) >= 2 ? (d.streak as number) : 0;
  return {
    title: clean(d.title, 120), link: `${SITE}/m/${encodeURIComponent(clean(d.slug, 90))}`,
    aName: clean(d.a_name), bName: clean(d.b_name), aCents: msg.aCents, bCents: msg.bCents,
    mineName: mine ? name(mine) : "", otherName: name(other), mineCents: cents(mine), otherCents: cents(other),
    leaderName: name(d.leader_id), winnerName: name(winner), backedBoth: backed.length > 1, backedWinner, streak,
    timeLeft: formatTimeLeft(left), closesAt: msg.endsAt ? formatCloseTime(msg.endsAt) : "", tie: !!d.tie, nextRound: !!d.next_round,
    gap: Math.abs(msg.aCents - msg.bCents), sandbox: msg.environment === "sandbox",
  };
}
type Facts = ReturnType<typeof engagementFacts>;

export function engagementSubject(kind: EngagementKind, f: Facts) {
  const base = kind === "overtaken" ? `${f.leaderName} just took the lead in ${f.title}`
    : kind === "closing_soon" ? `${f.title} closes in ${f.timeLeft}: ${f.mineName} is ${usdWhole(f.gap)} behind`
    : `${f.winnerName} won the round in ${f.title}`;
  return clean(`${f.sandbox ? "[TEST] " : ""}${base}`, 160);
}

function Score({ f }: { f: Facts }) {
  return <Section style={{ backgroundColor: EMAIL_COLORS.card, borderRadius: "12px", padding: "12px 16px", margin: "0 0 16px" }}>
    <Text style={{ ...emailText, margin: 0, color: EMAIL_COLORS.muted, fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>{f.sandbox ? "Test score (sandbox pulls only)" : "Round score"}</Text>
    <Text style={{ ...emailText, margin: "4px 0 0", fontSize: "20px", fontWeight: "800" }}>{f.aName} {usdWhole(f.aCents)} · {f.bName} {usdWhole(f.bCents)}</Text>
  </Section>;
}

function Body({ kind, f }: { kind: EngagementKind; f: Facts }) {
  if (kind === "overtaken") return <>
    <Text style={emailText}>{f.leaderName} just moved ahead of {f.mineName}, the side you pulled for in this round of {f.title}.</Text>
    <Score f={f} />
    <Text style={emailText}>Time left in this round: <strong>{f.timeLeft}</strong> (closes {f.closesAt}).</Text>
  </>;
  if (kind === "closing_soon") return <>
    <Text style={emailText}>This round of {f.title} closes in <strong>{f.timeLeft}</strong> ({f.closesAt}). {f.mineName}, the side you pulled for, is {usdWhole(f.gap)} behind {f.otherName}.</Text>
    <Score f={f} />
  </>;
  return <>
    <Text style={emailText}>{f.winnerName} won this round of {f.title}{f.tie ? " on the tie-break: the totals were level and it reached them first." : "."}</Text>
    <Score f={f} />
    <Text style={emailText}>{f.backedBoth ? "You pulled for both sides this round." : `You backed ${f.mineName}. ${f.backedWinner ? "Your side won." : "Your side didn't win this one."}`}</Text>
    {f.streak >= 2 ? <Text style={{ ...emailText, color: EMAIL_COLORS.brand, fontWeight: "800" }}>You have backed the winner {f.streak} rounds running.</Text> : null}
    {f.nextRound ? <Text style={emailText}>A new round has already started.</Text> : null}
  </>;
}

export function EngagementEmail({ kind, f, unsubscribeUrl }: { kind: EngagementKind; f: Facts; unsubscribeUrl: string }) {
  const heading = kind === "overtaken" ? `${f.leaderName} took the lead` : kind === "closing_soon" ? `${f.mineName} is ${usdWhole(f.gap)} behind` : `${f.winnerName} won the round`;
  return <EmailFrame preview={engagementSubject(kind, f)} heading={heading}
    banner={f.sandbox ? "TEST EMAIL: a sandbox purchase, no real money. Live scores are not affected." : undefined}
    footer={<>You're getting this because you pulled in this round with this email address. Tugg sends at most one email of each type per round.{" "}
      <Link href={unsubscribeUrl} style={{ color: EMAIL_COLORS.muted, textDecoration: "underline" }}>Unsubscribe from round updates</Link>; receipts and refund notices still arrive.
      {" "}Tugg is entertainment only: no prizes or payouts. Tugg · hello@tugg.lol</>}>
    <Body kind={kind} f={f} />
    <Section style={{ margin: "8px 0 0" }}><Button href={f.link} style={emailButton}>{kind === "round_result" && f.nextRound ? "See the new round" : "Open the matchup"}</Button></Section>
    <Text style={{ ...emailText, fontSize: "13px", margin: "12px 0 0" }}><Link href={f.link} style={emailLink}>{f.link.replace("https://", "")}</Link></Text>
  </EmailFrame>;
}

export async function renderEngagement(msg: EngagementMessage) {
  const f = engagementFacts(msg);
  const element = <EngagementEmail kind={msg.kind} f={f} unsubscribeUrl={msg.unsubscribeUrl} />;
  return { subject: engagementSubject(msg.kind, f), html: await render(element), text: await render(element, { plainText: true }), facts: f };
}
