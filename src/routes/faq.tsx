import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { activePaymentCopy } from "@/lib/payments/copy";
import { policySections, pageHead, supportAnswers } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/faq")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: ({ loaderData }) => ({
    ...pageHead(policySections["faq"].title, policySections["faq"].description),
    links: [{ rel: "canonical", href: "https://tugg.lol/faq" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: supportAnswers.map((a) => ({ "@type": "Question", name: a.title, acceptedAnswer: { "@type": "Answer", text: activePaymentCopy(a.text, loaderData?.provider, loaderData?.basket) } })),
      }),
    }],
  }),
  component: Page,
});
function Page() {
  const { email, provider, basket } = Route.useLoaderData();
  return <PolicyPage id="faq" provider={provider} basket={basket} email={email} />;
}
