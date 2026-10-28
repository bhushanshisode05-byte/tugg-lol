import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/faq")({
 loader: () => getPublicContact(),
 head: () => pageHead(policySections["faq"].title, policySections["faq"].description),
 component: Page,
});
function Page() { const { email } = Route.useLoaderData(); return <PolicyPage id="faq" email={email} />; }
