import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Turnstile, type TurnstileHandle } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
const transport = new DefaultChatTransport({ api: "/api/public/support/chat" });
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const ts = useRef<TurnstileHandle>(null);
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (open && !busy) input.current?.focus();
  }, [open, busy]);
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
      {open && (
        <section
          aria-label="Tugg FAQ chat"
          className="mb-3 flex h-[min(560px,75dvh)] w-96 max-w-full flex-col rounded-lg border border-border bg-background shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <span className="font-display text-xl font-extrabold">
                tugg<span className="text-primary">.</span>
              </span>
              <span className="ml-2 text-sm text-muted-foreground">FAQ support</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>
          <Conversation>
            <ConversationContent>
              {messages.length === 0 && (
                <p className="text-muted-foreground">
                  What would you like to know about pulls, rounds, or refunds?
                </p>
              )}
              {messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent
                    className={
                      m.role === "user"
                        ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                        : ""
                    }
                  >
                    {m.parts.map((p, i) =>
                      p.type === "text" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))}
              {busy && <Shimmer>Checking Tugg’s policies…</Shimmer>}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          {error && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <div className="border-t border-border p-3">
            <Turnstile ref={ts} action={TURNSTILE_ACTIONS.chat} onToken={setToken} className="mb-2" />
            <PromptInput
              onSubmit={async () => {
                if (!text.trim() || busy || !token) return;
                const value = text;
                const used = token;
                setText("");
                // Each question carries a fresh single-use token; reset for the next one.
                ts.current?.reset();
                await sendMessage({ text: value }, { body: { turnstileToken: used } });
              }}
            >
              <PromptInputTextarea
                ref={input}
                aria-label="Your FAQ question"
                maxLength={3000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask about Tugg…"
              />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit status={status} onStop={stop} disabled={!busy && (!text.trim() || !token)} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </section>
      )}
      <Button
        aria-label={open ? "Hide FAQ chat" : "Open FAQ chat"}
        onClick={() => setOpen((v) => !v)}
      >
        <MessageCircle /> FAQ support
      </Button>
    </div>
  );
}
