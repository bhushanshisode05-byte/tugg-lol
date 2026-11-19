import { activePaymentCopy } from "./payments/copy";
import { IMAGE_POLICY } from "./side-image";
import { ALL_TIME_RULE, ROUND_LENGTH_RULE } from "./rounds";
import { ALLOWED_SUBJECTS, NOT_ALLOWED_SUBJECTS, REAL_PERSON_RULE_PUBLIC } from "./content-policy";
export const supportAnswers = [
  {
    id: "pulls",
    title: "What does a pull buy?",
    text: "Each pull costs exactly $1. {{pullOffer}} there are no credits, stored balances or unused pulls to carry over. Bundles are non-refundable except where required by law. Failed or expired payments apply nothing. There are no prizes, payouts, or winnings. Losing a round does not qualify for a refund.",
  },
  {
    id: "rounds",
    title: "How do rounds work?",
    text: `${ROUND_LENGTH_RULE} When a round ends, the side with more money in that round wins bragging rights, and a new round starts. ${ALL_TIME_RULE} A tie goes to the side that reached the final total first. An empty round has no winner and leaves streaks unchanged. A lead-changing pull in the last 10 minutes adds 10 minutes, at most three times.`,
  },
  {
    id: "create",
    title: "How much does a matchup cost?",
    text: "Creating a standard matchup costs $9. A featured matchup costs $29 and is featured for 7 days. All prices are in US dollars. Matchups are checked by moderation after payment.",
  },
  {
    id: "rejected",
    title: "What if moderation rejects my matchup?",
    text: "Matchups rejected by moderation are refunded automatically and in full to the original payment method through {{provider}}. The time it takes to appear depends on {{provider}} and your bank. Support cannot promise a refund for an approved matchup or an ordinary pull.",
  },
  {
    id: "payment",
    title: "What if I have a payment error?",
    text: "{{providerProcesses}} through a hosted checkout. Bundles are applied only after a verified payment callback or a server-side status check; returning from checkout does not confirm payment. All pulls in the bundle and the matching accounting entries succeed together. Use the contact form with your checkout email and {{provider}} payment reference for a genuine payment error. Verified technical errors are reviewed under the published policy and applicable law; support cannot invent refund exceptions. A pending payment or short confirmation delay is not proof of an error.",
  },
  {
    id: "moderation",
    title: "What is allowed?",
    // Built from the same lists the generator and moderation use (content-policy.ts).
    text: `Matchups may cover ${ALLOWED_SUBJECTS}. ${REAL_PERSON_RULE_PUBLIC} Not allowed: ${NOT_ALLOWED_SUBJECTS}. Side names and shout-outs are moderated; a rejected shout-out is replaced with a placeholder and does not refund the pull.`,
  },
  {
    id: "privacy",
    title: "What information does Tugg store?",
    text: "Tugg stores payment references, purchase and ledger entries, pull amounts, optional public display names and shout-outs, billing country information, matchup submissions, and support messages and replies. {{billingPrivacy}} Legacy wallet records are retained privately but wallets are dormant in immediate-bundle mode. Support records are private and accessible only to the owner. Hashed network identifiers limit abuse. Support text is sent to an AI service to match questions to published policies; do not include card numbers, passwords, recovery links, or sensitive personal information.",
  },
  { id: "images", title: "Side pictures and takedowns", text: IMAGE_POLICY },
  {
    id: "scope",
    title: "What can support answer?",
    text: "Tugg support answers only questions covered by Tugg’s rules, FAQ, Terms, Privacy, and Refund Policy. It cannot change results, promise prizes or payouts, or make refund exceptions. For a payment problem, use the contact form. Other questions outside these policies cannot be answered here.",
  },
] as const;
export type AnswerId = (typeof supportAnswers)[number]["id"];
export function approvedAnswer(id: string, provider = "dodo", basket = false) {
  return activePaymentCopy(
    supportAnswers.find((a) => a.id === id)?.text ??
    supportAnswers.find((a) => a.id === "scope")?.text ??
    "Tugg support answers only published policies.", provider, basket
  );
}
export const policySections = {
  "how-it-works": {
    title: "How Tugg works",
    description: "Pick a rivalry, choose a side, and pull for bragging rights.",
    sections: [
      { title: "Pick your side", text: supportAnswers[0].text },
      { title: "Rounds and the all-time score", text: supportAnswers[1].text },
      { title: "Start a rivalry", text: supportAnswers[2].text },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    description: "Straight answers about Tugg pulls, rounds, payments, and refunds.",
    sections: supportAnswers.map((a) => ({ title: a.title, text: a.text })),
  },
  terms: {
    title: "Terms of use",
    description: "The plain-English terms for using Tugg.",
    sections: [
      { title: "Paid entertainment, not a prize", text: supportAnswers[0].text },
      {
        title: "Purchases and refunds",
        text: supportAnswers[2].text + " " + supportAnswers[3].text + " " + supportAnswers[4].text,
      },
      {
        title: "Fair use",
        text:
          supportAnswers[5].text +
          " Do not submit content you have no right to use, interfere with payments, or abuse the site.",
      },
      {
        title: "Results",
        text:
          supportAnswers[1].text +
          " Results are entertainment only. Tugg is not affiliated with the brands or teams in a matchup.",
      },
      { title: "Side pictures and takedowns", text: IMAGE_POLICY },
      {
        title: "Your legal rights",
        text: "These terms do not remove rights that cannot legally be excluded under applicable consumer law. Tugg is the business operating this service in India. Contact Tugg using the contact page for questions.",
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    description: "What Tugg collects and how it is used.",
    sections: [
      { title: "Information we use", text: supportAnswers[6].text },
      {
        title: "Why we use it",
        text: "We use this information to fulfill purchases, moderate submissions, show public rivalry results, reply to support requests, prevent abuse, and investigate payment errors. Payment and hosting providers may process information outside your country. Pages load fonts and emoji images from public content networks (Google Fonts and jsDelivr), which receive your IP address and browser details to deliver those files.",
      },
      {
        title: "Your checkout email",
        text: "{{buyerEmailPrivacy}} We keep it so the pulls you buy can be credited to you later — for example, for future badges or a top-puller ranking that count past purchases. It is private: it never appears on public pages, leaderboards, the Hall of Fame, share images, feeds or any public data, and we do not sell it, share it with other players or use it for advertising. We also use it to send round update emails about rounds you pulled in (see below). Contact Tugg to ask about access or deletion.",
      },
      {
        title: "Round update emails",
        text: "The pull panel and your receipt say this before and when you buy: we email the address you give at checkout about rounds you pull in. There are three kinds, each sent at most once per round: when your side loses the lead, when a close round is about to end and your side is behind by an amount that can realistically be made up, and the round result (with a winning streak only when it is true). They contain only public facts shown on the site, such as side names, round totals and time left, plus which side you backed; they never name or identify other buyers. Every one has a one-click unsubscribe link that works without an account, takes effect immediately and is permanent for that address. Unsubscribing does not stop purchase receipts or refund notices. Test (sandbox) purchases never produce emails that look live; test emails are marked TEST. These emails are sent by a separate email delivery provider, which processes your address and the message to deliver it. We keep a hashed copy of an unsubscribed address so we never email it again, and we delete the address from each queued message once it is sent or dropped.",
      },
      {
        title: "App emails and private records",
        text: "We retain the email address you supply at checkout to send your purchase receipt and matchup/refund updates. Contact-form messages, sender addresses and policy-based replies are stored privately; the reply is emailed to the sender and a copy of the thread goes to hello@tugg.lol. The owner receives limited operational alerts and a weekly summary. Our email provider processes recipient addresses and message content to deliver these messages and manage retries, bounces, complaints and unsubscribe requests. Operational send logs contain a hashed recipient identifier, message type, event reference and result, not message bodies or card data. These records are used for support, abuse prevention, delivery troubleshooting and legal obligations; contact Tugg about access or deletion. Email unsubscribe requests are honored by the provider; round update emails have their own unsubscribe, described above. Recap signup addresses are stored privately, but daily digest delivery and confirmation are not active; no existing signup is treated as confirmed consent.",
      },
      {
        title: "Access and deletion",
        text: "Contact Tugg to ask about access, correction, or deletion of your information. We may need to keep records for payment disputes and legal obligations. We do not sell support messages or personal information. Browser storage is used for sign-in sessions; payment services may use their own cookies.",
      },
    ],
  },
  "refund-policy": {
    title: "Refund policy",
    description: "Which Tugg purchases are refundable—and which are not.",
    sections: [
      { title: "Pulls are non-refundable", text: supportAnswers[0].text },
      { title: "Rejected matchups", text: supportAnswers[3].text },
      { title: "Genuine payment errors", text: supportAnswers[4].text },
      {
        title: "Payment processing",
        text: "{{providerProcesses}} and refunds for Tugg. Refunds go to the original payment method. Applicable statutory consumer rights remain unchanged.",
      },
    ],
  },
  "about-legal": {
    title: "About / Legal",
    description: "Tugg’s business identity and contact details.",
    sections: [
      {
        title: "Tugg",
        text: "Business name: Tugg. Based in India. Tugg is an independent paid entertainment site built around friendly rivalries. It offers no prizes, payouts, or winnings.",
      },
      {
        title: "Payments and content",
        text: "{{providerProcesses}} for Tugg. Brands, teams, and places named in matchups are not sponsors or partners unless explicitly stated. Tugg does not claim ownership of their names.",
      },
      {
        title: "Emoji artwork",
        text: "Side emoji on Tugg pages and share images are Noto Color Emoji artwork by Google LLC (googlefonts/noto-emoji), licensed under the Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0. Flag artwork comes from Noto’s region-flags set, which is in the public domain. Tugg shows them resized but otherwise unchanged.",
      },
    ],
  },
};
export type PolicyPageId = keyof typeof policySections;
export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} | Tugg` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | Tugg` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
