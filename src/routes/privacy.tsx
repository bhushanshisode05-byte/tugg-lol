import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/privacy")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: () => pageHead(policySections["privacy"].title, policySections["privacy"].description),
  component: Page,
});
function Page() {
  const { email } = Route.useLoaderData();
  return <PolicyPage id="privacy" email={email} />;
}
