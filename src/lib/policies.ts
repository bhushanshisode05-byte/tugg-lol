import { IMAGE_POLICY } from "./side-image";
export const supportAnswers = [
  {
    id: "pulls",
    title: "What does a pull buy?",
    text: "A pull is a non-refundable paid entertainment purchase. Choose a side and pay $1–$1,000 in whole US dollars to move its rope. There are no prizes, payouts, or winnings. Losing a round does not qualify for a refund.",
  },
  {
    id: "rounds",
    title: "How do rounds work?",
    text: "Rounds end at 00:00 UTC. The side with more money wins bragging rights, and a new round starts. A tie goes to the side that reached the final total first. An empty round has no winner and leaves streaks unchanged. A lead-changing pull in the last 10 minutes adds 10 minutes, at most three times.",
  },
  {
    id: "create",
    title: "How much does a matchup cost?",
    text: "Creating a standard matchup costs $9. A featured matchup costs $29 and is featured for 7 days. All prices are in US dollars. Matchups are checked by moderation after payment.",
  },
  {
    id: "rejected",
    title: "What if moderation rejects my matchup?",
    text: "Matchups rejected by moderation are refunded automatically and in full to the original payment method through Stripe. The time it takes to appear depends on Stripe and your bank. Support cannot promise a refund for an approved matchup or an ordinary pull.",
  },
  {
    id: "payment",
    title: "What if I have a payment error?",
    text: "Stripe processes payments. A pull counts only after payment is confirmed. If a charged pull never counts because of a technical error, it is refunded after verification. Use the contact form with the email used at checkout and Stripe checkout session reference. Only verified payment errors are escalated. A pending payment or a short confirmation delay is not proof of an error.",
  },
  {
    id: "moderation",
    title: "What is allowed?",
    text: "Matchups may cover brands, products, places, cities, countries, teams, foods, ideas, and entertainment. Private individuals, political parties or candidates, hate, harassment, sexual content, illegal content, and scams are not allowed. Side names and shout-outs are moderated; a rejected shout-out is replaced with a placeholder and does not refund the pull.",
  },
  {
    id: "privacy",
    title: "What information does Tugg store?",
    text: "Tugg stores payment references, pull amounts, optional public display names and shout-outs, country information, matchup submissions, and support messages and replies. Stripe handles payment details; Tugg does not store full card numbers. Support records are private and accessible only to the owner. Hashed network identifiers are used to limit abuse. Support text is sent to an AI service to match questions to the published policies; do not include card numbers, passwords, or sensitive personal information.",
  },
  { id: "images", title: "Side pictures and takedowns", text: IMAGE_POLICY },
  {
    id: "scope",
    title: "What can support answer?",
    text: "Tugg support answers only questions covered by Tugg’s rules, FAQ, Terms, Privacy, and Refund Policy. It cannot change results, promise prizes or payouts, or make refund exceptions. For a payment problem, use the contact form. Other questions outside these policies cannot be answered here.",
  },
] as const;
export type AnswerId = (typeof supportAnswers)[number]["id"];
export function approvedAnswer(id: string) {
  return (
    supportAnswers.find((a) => a.id === id)?.text ??
    supportAnswers.find((a) => a.id === "scope")?.text ??
    "Tugg support answers only published policies."
  );
}
export const policySections = {
  "how-it-works": {
    title: "How Tugg works",
    description: "Pick a rivalry, choose a side, and pull for bragging rights.",
    sections: [
      { title: "Pick your side", text: supportAnswers[0].text },
      { title: "A fresh contest every day", text: supportAnswers[1].text },
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
        text: "We use this information to fulfill purchases, moderate submissions, show public rivalry results, reply to support requests, prevent abuse, and investigate payment errors. Payment and hosting providers may process information outside your country.",
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
        text: "Payments and refunds are processed by Stripe. Refunds go to the original payment method. Applicable statutory consumer rights remain unchanged.",
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
        text: "Payments are processed by Stripe. Brands, teams, and places named in matchups are not sponsors or partners unless explicitly stated. Tugg does not claim ownership of their names.",
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
