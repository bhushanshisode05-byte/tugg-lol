import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/tugg/PolicyPage";
import { policySections, pageHead } from "@/lib/policies";
import { getPublicContact } from "@/lib/support.functions";
export const Route = createFileRoute("/how-it-works")({
 loader: () => getPublicContact(),
 head: () => pageHead(policySections["how-it-works"].title, policySections["how-it-works"].description),
 component: Page,
});
function Page() { const { email } = Route.useLoaderData(); return <PolicyPage id="how-it-works" email={email} />; }
