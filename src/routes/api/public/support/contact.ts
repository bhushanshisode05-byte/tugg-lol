import { createFileRoute } from "@tanstack/react-router";
import { contactSchema } from "@/lib/support-schema";
export const Route = createFileRoute("/api/public/support/contact")({ server: { handlers: { POST: async ({ request }) => {
  const { limitSupport, saveMessage, answerFromPolicies, saveReply, checkPaymentError, SupportError } = await import("@/lib/support.server");
  let id: string | undefined;
  try {
    if (Number(request.headers.get("content-length") || 0) > 20000) return Response.json({ error: "Message too long." }, { status: 400 });
    const input = contactSchema.parse(await request.json());
    await limitSupport(request, "contact");
    id = await saveMessage("contact", input.message, input.email, input.name);
    const reply = await answerFromPolicies(request, input.message);
    const paymentNote = await checkPaymentError(input, id);
    await saveReply(id, reply + paymentNote);
    return Response.json({ reply: reply + paymentNote, id });
  } catch (e) {
    const error = e instanceof SupportError ? e.message : "Please check your message and email address.";
    if (id) await saveReply(id, error, "error");
    return Response.json({ error }, { status: e instanceof SupportError ? e.status : 400 });
  }
} } } });