"use client";

import { FormEvent, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Loader2, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Button, EmptyState, Input } from "./ui";

type Message = { role: "user" | "assistant"; text: string };

export function ChatbotPanel() {
  const ask = useAction(api.chatbot.ask);
  const confirm = useMutation(api.chatbot.confirm);
  const pendingProposals = useQuery(api.chatbot.listPending, {});
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const message = String(data.get("message") ?? "").trim();
    if (!message) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    setPending(true);
    setError("");
    form.reset();
    try {
      const result = await ask({ message });
      setMessages((current) => [...current, { role: "assistant", text: result.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant could not respond.");
    } finally {
      setPending(false);
    }
  }

  async function decide(proposalId: string, approved: boolean) {
    try {
      const result = await confirm({ proposalId, approved });
      setMessages((current) => [...current, { role: "assistant", text: result }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm the action.");
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex min-h-[620px] flex-col rounded-lg border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><Bot className="h-5 w-5" /> CRM assistant</div>
          <p className="mt-1 text-sm text-muted">Answers use only tasks your role is allowed to access.</p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {messages.length === 0 ? (
            <EmptyState title='Try "What is overdue?", "Add note to JO-XXXX: waiting on client", or "Mark JO-XXXX completed".' />
          ) : messages.map((message, index) => (
            <div key={index} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-ink text-white" : "bg-panel text-ink"}`}>
              {message.text}
            </div>
          ))}
        </div>
        {error ? <p className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-4">
          <Input name="message" placeholder="Ask about tasks or propose an action..." autoComplete="off" />
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </form>
      </div>
      <aside className="rounded-lg border border-line bg-white p-4">
        <h3 className="font-semibold text-ink">Confirm actions</h3>
        <p className="mt-1 text-sm text-muted">Chatbot changes are never saved until you approve them here.</p>
        <div className="mt-4 grid gap-3">
          {pendingProposals?.length ? pendingProposals.map((proposal) => (
            <div key={proposal._id} className="rounded-md border border-line bg-panel p-3">
              <p className="text-sm text-ink">{proposal.summary}</p>
              <div className="mt-3 flex gap-2">
                <Button type="button" onClick={() => void decide(proposal._id, true)}>Confirm</Button>
                <Button type="button" variant="secondary" onClick={() => void decide(proposal._id, false)}>Cancel</Button>
              </div>
            </div>
          )) : <p className="text-sm text-muted">No actions awaiting confirmation.</p>}
        </div>
      </aside>
    </section>
  );
}
