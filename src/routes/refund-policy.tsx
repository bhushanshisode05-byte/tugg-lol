import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/refund-policy")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: () =>
    pageHead(policySections["refund-policy"].title, policySections["refund-policy"].description),
  component: Page,
});
function Page() {
  const { email, provider } = Route.useLoaderData();
  return <PolicyPage id="refund-policy" provider={provider} email={email} />;
}
