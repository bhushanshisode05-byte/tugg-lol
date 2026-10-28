import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/terms")({
  loader: () => getPublicContact(),
  head: () => pageHead(policySections["terms"].title, policySections["terms"].description),
  component: Page,
});
function Page() {
  const { email } = Route.useLoaderData();
  return <PolicyPage id="terms" email={email} />;
}
