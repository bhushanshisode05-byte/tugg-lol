import { createFileRoute } from "@tanstack/react-router";
import { contactSchema } from "@/lib/support-schema";
import { readSupportJson, BodyTooLarge } from "@/lib/support-input.server";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "@/lib/turnstile";
import { verifyTurnstileForRequest, TurnstileError } from "@/lib/turnstile.server";
export const Route = createFileRoute("/api/public/support/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          limitSupport,
          saveMessage,
          answerFromPolicies,
          saveReply,
          checkPaymentError,
          SupportError,
        } = await import("@/lib/support.server");
        let id: string | undefined;
        try {
          const body = await readSupportJson(request);
          const input = contactSchema.parse(body);
          const token = turnstileTokenSchema.parse((body as { turnstileToken?: unknown })?.turnstileToken);
          // Verified before any save, payment check or AI call. Fails closed.
          await verifyTurnstileForRequest(token, TURNSTILE_ACTIONS.contact, request);
          await limitSupport(request, "contact");
          id = await saveMessage("contact", input.message, input.email, input.name);
          const paymentNote = await checkPaymentError(input, id);
          const reply = await answerFromPolicies(request, input.message);
          await saveReply(id, reply + paymentNote);
          return Response.json({ reply: reply + paymentNote, id });
        } catch (e) {
          if (e instanceof TurnstileError)
            return Response.json({ error: e.message, turnstile: e.reason }, { status: e.status });
          const error =
            e instanceof SupportError ? e.message : "Please check your message and email address.";
          if (id) await saveReply(id, error, "error");
          return Response.json(
            { error },
            {
              status: e instanceof BodyTooLarge ? 413 : e instanceof SupportError ? e.status : 400,
            },
          );
        }
      },
    },
  },
});
