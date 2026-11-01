import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/about-legal")({
  staticData: { sitemap: true },
  loader: () => getPublicContact(),
  head: () =>
    pageHead(policySections["about-legal"].title, policySections["about-legal"].description),
  component: Page,
});
function Page() {
  const { email, operator } = Route.useLoaderData();
  return <PolicyPage id="about-legal" email={email} operator={operator} />;
}
