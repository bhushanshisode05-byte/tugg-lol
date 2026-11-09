import { Link } from "@tanstack/react-router";
import { Shell } from "./Shell";
import { activePaymentCopy } from "@/lib/payments/copy";
import { policySections, type PolicyPageId } from "@/lib/policies";
export function PolicyPage({ id, email, operator, provider = "dodo", basket = false }: { provider?: string; basket?: boolean; id: PolicyPageId; email?: string | null; operator?: string | null }) {
  const page = policySections[id];
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <p className="mb-3 font-mono text-sm text-primary">TUGG / THE DETAILS</p>
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{page.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{page.description}</p>
        <div className="mt-10 divide-y divide-border">
          {page.sections.map((s) => (
            <section key={s.title} className="py-6">
              <h2 className="font-display text-2xl font-bold">{s.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{activePaymentCopy(s.text,provider,basket)}</p>
            </section>
          ))}
        </div>
        {id === "about-legal" && (
          <section className="border-t border-border py-6">
            <h2 className="text-2xl font-bold">Operator and contact</h2>
            <p className="mt-3 text-muted-foreground">{operator ? `Operated by ${operator}.` : "Operator identity is being configured; checkout remains unavailable."}</p>
            {email ? (
              <a className="mt-3 block text-primary" href={`mailto:${email}`}>
                {email}
              </a>
            ) : (
              <p className="mt-3 text-muted-foreground">
                Use our contact form while a public contact email is being configured.
              </p>
            )}
            <Link to="/contact" className="mt-3 inline-block text-primary underline">
              Contact form
            </Link>
          </section>
        )}
      </article>
    </Shell>
  );
}
