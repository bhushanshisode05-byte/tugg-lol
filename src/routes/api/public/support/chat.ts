import { createFileRoute } from "@tanstack/react-router";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { z } from "zod";
import { readSupportJson, BodyTooLarge } from "@/lib/support-input.server";
const schema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(["user", "assistant"]),
        parts: z
          .array(z.object({ type: z.literal("text"), text: z.string().max(3000) }))
          .min(1)
          .max(10),
      }),
    )
    .min(1)
    .max(30),
});
export const Route = createFileRoute("/api/public/support/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { limitSupport, saveMessage, answerFromPolicies, saveReply, SupportError } =
          await import("@/lib/support.server");
        try {
          const input = schema.parse(await readSupportJson(request));
          const last = input.messages.at(-1);
          if (last?.role !== "user")
            return Response.json({ error: "A question is required." }, { status: 400 });
          const text = z
            .string()
            .trim()
            .min(1)
            .max(3000)
            .parse(last.parts.map((p) => p.text).join("\n"));
          await limitSupport(request, "chat");
          const id = await saveMessage("chat", text);
          // One session conversation. Each question/reply is privately archived; previous browser turns cannot override the policies.
          const stream = createUIMessageStream({
            originalMessages: input.messages as UIMessage[],
            onError: (e) => (e instanceof Error ? e.message : "Support could not answer."),
            execute: async ({ writer }) => {
              try {
                const reply = await answerFromPolicies(request, text);
                await saveReply(id, reply);
                writer.write({ type: "text-start", id });
                writer.write({ type: "text-delta", id, delta: reply });
                writer.write({ type: "text-end", id });
              } catch (e) {
                await saveReply(id, e instanceof Error ? e.message : "Support failed.", "error");
                throw e;
              }
            },
          });
          return createUIMessageStreamResponse({
            stream,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (e) {
          return Response.json(
            { error: e instanceof SupportError ? e.message : "Please enter a valid question." },
            {
              status: e instanceof BodyTooLarge ? 413 : e instanceof SupportError ? e.status : 400,
            },
          );
        }
      },
    },
  },
});
