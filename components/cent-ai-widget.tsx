"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Check, ChevronDown, Loader2, Maximize2, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { Button, cn } from "./ui";

type Message = { role: "user" | "assistant"; text: string };

const quickPrompts = ["What needs attention today?", "Show overdue tasks", "What is the team working on?"];

export function CentAiWidget() {
  const me = useQuery(api.auth.getMe, {});
  const ask = useAction(api.chatbot.ask);
  const confirm = useMutation(api.chatbot.confirm);
  const proposals = useQuery(api.chatbot.listPending, me ? {} : "skip");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi, I'm **Center A.I bot**. Ask me about your work, clients, payments, or team. I can also prepare CRM actions for your approval." }
  ]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, proposals?.length, pending]);

  if (!me || me.isActive === false || me.accessStatus === "suspended" || me.accessStatus === "removed") return null;

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || pending) return;
    setMessages((current) => [...current, { role: "user", text: clean }]);
    setMessage("");
    setError("");
    setPending(true);
    try {
      const result = await ask({ message: clean });
      setMessages((current) => [...current, { role: "assistant", text: result.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Center A.I bot could not respond.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(message);
  }

  async function decide(proposalId: string, approved: boolean) {
    setError("");
    try {
      const result = await confirm({ proposalId, approved });
      setMessages((current) => [...current, { role: "assistant", text: result }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete that action.");
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
      {open ? (
        <section
          aria-label="Center A.I bot"
          className={cn(
            "flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#d9dedb] bg-white shadow-[0_24px_70px_rgba(16,33,28,.22)] transition-all duration-300 sm:w-[390px]",
            expanded ? "h-[min(760px,calc(100vh-3rem))] sm:w-[620px]" : "h-[min(650px,calc(100vh-3rem))]"
          )}
        >
          <header className="flex items-center justify-between bg-[#10211c] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d8a44c] text-[#10211c]">
                <span className="absolute inset-1 animate-ping rounded-lg border border-[#10211c]/25 [animation-duration:2.4s]" />
                <Bot className="relative h-5 w-5 animate-[bounce_2.2s_ease-in-out_infinite]" />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#10211c] bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Center A.I bot</p>
                <p className="flex items-center gap-1 text-[11px] text-white/60"><Sparkles className="h-3 w-3" /> Permission-aware CRM copilot</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Resize assistant" onClick={() => setExpanded((value) => !value)} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
                <Maximize2 className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Minimize assistant" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f7f8f6] p-4">
            {messages.map((item, index) => (
              <div key={index} className={cn("rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm", item.role === "user" ? "ml-auto max-w-[88%] whitespace-pre-wrap rounded-br-md bg-[#173328] text-white" : "max-w-[96%] rounded-bl-md border border-line bg-white text-ink")}>
                {item.role === "assistant" ? <AssistantMessage text={item.text} /> : item.text}
              </div>
            ))}
            {pending ? (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-2.5 text-sm text-muted shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#98702b]" /> Thinking through your CRM...
              </div>
            ) : null}
            {proposals?.map((proposal) => (
              <div key={proposal._id} className="rounded-xl border border-[#dfc58f] bg-[#fffaf0] p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a641e]">Approval required</p>
                <p className="mt-1.5 text-sm leading-5 text-ink">{proposal.summary}</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" className="h-8 bg-[#173328]" onClick={() => void decide(proposal._id, true)}><Check className="h-3.5 w-3.5" /> Approve</Button>
                  <Button type="button" variant="secondary" className="h-8" onClick={() => void decide(proposal._id, false)}><X className="h-3.5 w-3.5" /> Cancel</Button>
                </div>
              </div>
            ))}
          </div>

          {messages.length <= 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-line bg-white px-3 py-2.5">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void send(prompt)} className="shrink-0 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-muted transition hover:border-[#d8a44c] hover:text-ink">
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-danger">{error}</p> : null}
          <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-white p-3">
            <textarea
              aria-label="Message Center A.I bot"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(message);
                }
              }}
              placeholder="Ask or tell Center A.I bot what to do..."
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink outline-none transition focus:border-[#d8a44c] focus:bg-white"
              rows={1}
            />
            <button type="submit" aria-label="Send message" disabled={pending || !message.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d8a44c] text-[#10211c] transition hover:bg-[#e8c27f] disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      ) : (
        <button type="button" aria-label="Open Center A.I bot" onClick={() => setOpen(true)} className="group flex items-center gap-3 rounded-full bg-[#10211c] p-2 pr-4 text-white shadow-[0_16px_40px_rgba(16,33,28,.3)] transition hover:-translate-y-0.5 hover:bg-[#173328]">
          <span className="relative grid h-11 w-11 place-items-center rounded-full bg-[#d8a44c] text-[#10211c]">
            <span className="absolute inset-1 animate-ping rounded-full border border-[#10211c]/25 [animation-duration:2.4s]" />
            <Bot className="relative h-5 w-5 animate-[bounce_2.2s_ease-in-out_infinite]" />
            <span className="absolute right-0 top-0 h-3 w-3 animate-pulse rounded-full border-2 border-[#10211c] bg-emerald-400" />
          </span>
          <span className="hidden text-left sm:block"><span className="block text-sm font-semibold">Center A.I bot</span><span className="block text-[11px] text-white/55">Ask your CRM</span></span>
        </button>
      )}
    </div>
  );
}

function AssistantMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h3 className="mb-2 mt-1 border-b border-line pb-2 text-base font-semibold text-[#173328]">{children}</h3>,
        h2: ({ children }) => <h3 className="mb-2 mt-3 border-b border-line pb-2 text-sm font-semibold text-[#173328] first:mt-0">{children}</h3>,
        h3: ({ children }) => <h3 className="mb-2 mt-3 rounded-lg bg-[#eef3ef] px-3 py-2 text-sm font-semibold text-[#173328] first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="my-2 leading-6 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 grid gap-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 grid list-decimal gap-1.5 pl-5">{children}</ol>,
        li: ({ children }) => <li className="rounded-lg border border-line/80 bg-[#fafbf9] px-3 py-2 leading-5 marker:text-[#98702b]">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[#173328]">{children}</strong>,
        code: ({ children }) => <code className="inline-flex rounded-md border border-[#dfc58f] bg-[#fff8e8] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#765516]">{children}</code>,
        hr: () => <hr className="my-3 border-line" />,
        a: ({ children, href }) => <a href={href} className="font-semibold text-blue-700 underline underline-offset-2">{children}</a>
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
