import React, { useState } from 'react';
import { MessageSquare, Send, X, ArrowRight, Sparkles } from 'lucide-react';
import type { AskAction } from '../server/assistant.ts';

interface AskAssistantModalProps {
  open: boolean;
  userId: string;
  onClose: () => void;
  onExecuteAction: (action: AskAction) => void;
}

const SUGGESTED_PROMPTS = [
  'Find a step-free route to UB City',
  'Show nearby accessible toilets',
  'Where is the nearest metro station?',
  'Report a broken lift',
  'Show an alternative route',
];

interface Message {
  role: 'user' | 'assistant';
  text: string;
  source?: 'gemini' | 'deterministic';
  facts?: string[];
  action?: AskAction;
}

export const AskAssistantModal: React.FC<AskAssistantModalProps> = ({
  open,
  userId,
  onClose,
  onExecuteAction,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Ask me for step-free routes, nearby accessible facilities, metro stations, or to report an accessibility barrier. Answers are grounded strictly in verified network records.',
    },
  ]);

  if (!open) return null;

  const sendQuery = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, userId }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer || 'Unable to process request.',
          source: data.source,
          facts: data.groundedFacts || [],
          action: data.action,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Network error while reaching AccessRoute assistant.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ask AccessRoute Assistant"
    >
      <div className="w-full md:max-w-lg bg-white dark:bg-[#102B27] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#17211F]/10 dark:border-white/10 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#17211F]/10 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#087F8C] text-white flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">Ask AccessRoute</h2>
              <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                Grounded route &amp; facility assistant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ask AccessRoute"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#087F8C] text-white'
                    : 'bg-[#F7F8F3] dark:bg-[#0D1917] text-[#17211F] dark:text-[#F7F8F3] border border-[#17211F]/10 dark:border-white/10'
                }`}
              >
                <p>{m.text}</p>
                {m.facts && m.facts.length > 0 && (
                  <ul className="mt-2 pt-2 border-t border-[#17211F]/10 dark:border-white/10 text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70 space-y-1">
                    {m.facts.slice(0, 3).map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                )}
                {m.action && m.action.type !== 'none' && (
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction(m.action!);
                      onClose();
                    }}
                    className="mt-3 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                  >
                    Apply on Map
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-[#17211F]/60 dark:text-[#F7F8F3]/60 px-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-[#087F8C]" /> Checking network data...
            </div>
          )}
        </div>

        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-[#17211F]/5 dark:border-white/5">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendQuery(p)}
              className="whitespace-nowrap shrink-0 px-3 py-2 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 text-xs font-medium hover:border-[#087F8C]"
            >
              {p}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuery(input);
          }}
          className="p-4 flex gap-2 border-t border-[#17211F]/10 dark:border-white/10"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about step-free routes, lifts, toilets..."
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm focus:outline-none focus:ring-2 focus:ring-[#087F8C]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send question"
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-[#087F8C] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#066974]"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
