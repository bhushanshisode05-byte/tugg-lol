import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead, supportAnswers } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/faq")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: () => ({
    ...pageHead(policySections["faq"].title, policySections["faq"].description),
    links: [{ rel: "canonical", href: "https://tugg.lol/faq" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: supportAnswers.map((a) => ({ "@type": "Question", name: a.title, acceptedAnswer: { "@type": "Answer", text: a.text } })),
      }),
    }],
  }),
  component: Page,
});
function Page() {
  const { email } = Route.useLoaderData();
  return <PolicyPage id="faq" email={email} />;
}
