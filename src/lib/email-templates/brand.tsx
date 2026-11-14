import * as React from "react";
import { Html, Head, Preview, Body, Container, Section, Text, Hr } from "@react-email/components";
import { SITE_COLORS } from "@/lib/og/theme";

/**
 * Shared email look, using the site's real colour tokens (the same single source the share cards use).
 * The page behind the card stays white (#ffffff) so every email client renders it predictably.
 */
export const EMAIL_COLORS = {
  page: "#ffffff",
  panel: SITE_COLORS.background,
  text: SITE_COLORS.foreground,
  muted: SITE_COLORS["muted-foreground"],
  brand: SITE_COLORS.primary,
  link: SITE_COLORS.primary,
  accent: SITE_COLORS.accent,
  rule: SITE_COLORS.border,
  card: SITE_COLORS.card,
} as const;

export const emailText = { fontSize: "15px", lineHeight: "24px", color: EMAIL_COLORS.text, overflowWrap: "anywhere" as const, margin: "0 0 12px" };
export const emailLink = { color: EMAIL_COLORS.link, fontWeight: "700", textDecoration: "underline" };
export const emailButton = { display: "inline-block", backgroundColor: EMAIL_COLORS.brand, color: EMAIL_COLORS.panel, fontWeight: "800", fontSize: "16px", padding: "12px 20px", borderRadius: "10px", textDecoration: "none" };

export function EmailFrame({ preview, heading, banner, children, footer }: { preview: string; heading: string; banner?: string | undefined; children: React.ReactNode; footer: React.ReactNode }) {
  return <Html lang="en" dir="ltr"><Head /><Preview>{preview}</Preview>
    <Body style={{ backgroundColor: EMAIL_COLORS.page, fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "16px 0" }}>
      <Container style={{ maxWidth: "560px", margin: "0 auto", backgroundColor: EMAIL_COLORS.panel, borderRadius: "16px", padding: "28px 24px" }}>
        {banner ? <Section style={{ backgroundColor: EMAIL_COLORS.accent, borderRadius: "8px", padding: "8px 12px", marginBottom: "16px" }}>
          <Text style={{ ...emailText, margin: 0, color: EMAIL_COLORS.panel, fontWeight: "700", fontSize: "13px" }}>{banner}</Text>
        </Section> : null}
        <Text style={{ fontSize: "26px", fontWeight: "900", letterSpacing: "-0.5px", color: EMAIL_COLORS.brand, margin: "0 0 8px" }}>Tugg</Text>
        <Text style={{ fontSize: "22px", lineHeight: "30px", fontWeight: "800", color: EMAIL_COLORS.text, margin: "0 0 16px" }}>{heading}</Text>
        {children}
        <Hr style={{ borderColor: EMAIL_COLORS.rule, margin: "24px 0 16px" }} />
        <Text style={{ fontSize: "12px", lineHeight: "18px", color: EMAIL_COLORS.muted, margin: 0 }}>{footer}</Text>
      </Container>
    </Body></Html>;
}
