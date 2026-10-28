import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/tugg/Shell";
import { ContactForm } from "@/components/tugg/ContactForm";
import { getPublicContact } from "@/lib/support.functions";
import { pageHead } from "@/lib/policies";
export const Route = createFileRoute("/contact")({ loader: () => getPublicContact(), head: () => pageHead("Contact Tugg", "Contact Tugg about its rules, policies, or a payment error."), component: Contact });
function Contact() { const { email }=Route.useLoaderData(); return <Shell><article className="mx-auto max-w-2xl px-4 py-12"><p className="mb-3 font-mono text-sm text-primary">TUGG / SUPPORT</p><h1 className="font-display text-5xl font-extrabold">Contact Tugg</h1><p className="mt-4 text-muted-foreground">Questions about a purchase or our policies?</p>{email && <a href={`mailto:${email}`} className="mt-3 block text-primary">{email}</a>}<ContactForm /></article></Shell>; }