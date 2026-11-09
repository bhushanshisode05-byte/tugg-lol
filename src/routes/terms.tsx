import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/terms")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: () => pageHead(policySections["terms"].title, policySections["terms"].description),
  component: Page,
});
function Page() {
  const { email, provider, basket } = Route.useLoaderData();
  return <PolicyPage id="terms" provider={provider} basket={basket} email={email} />;
}
