import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Send,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import type { AskAction } from '../server/assistant.ts';

interface HomeChatbotWidgetProps {
  userId: string;
  expanded: boolean;
  hiddenForOverlay?: boolean;
  hideOnMobileOverlay?: boolean;
  desktopOverlayOnLeft?: boolean;
  onToggleExpanded: (next: boolean) => void;
  onExecuteAction: (action: AskAction) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  source?: 'gemini' | 'deterministic';
  facts?: string[];
  action?: AskAction;
}

const QUICK_PROMPTS = [
  'Step-free route to UB City',
  'Accessible toilets nearby',
  'Nearest Metro station',
  'Report a broken lift',
];

export const HomeChatbotWidget: React.FC<HomeChatbotWidgetProps> = ({
  userId,
  expanded,
  hiddenForOverlay = false,
  hideOnMobileOverlay = false,
  desktopOverlayOnLeft = false,
  onToggleExpanded,
  onExecuteAction,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi! Ask me for step-free Bengaluru routes, operational lifts, accessible toilets, or to report a barrier.',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded, loading]);

  if (hiddenForOverlay) return null;

  const sendQuery = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    if (!expanded) onToggleExpanded(true);
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
        { role: 'assistant', text: 'Network error while reaching AccessRoute AI assistant.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const dockSideClass = desktopOverlayOnLeft
    ? 'left-3 right-3 md:left-auto md:right-4'
    : 'left-3 right-3 md:left-4 md:right-auto';

  return (
    <section
      aria-label="AccessRoute AI Chatbot"
      className={`absolute bottom-3 md:bottom-4 z-30 transition-all ${
        hideOnMobileOverlay ? 'hidden md:block' : ''
      } ${dockSideClass} ${expanded ? 'md:w-[392px]' : 'md:w-[340px]'}`}
    >
      {!expanded ? (
        <div className="bg-white/95 dark:bg-[#102B27]/95 backdrop-blur-md rounded-2xl shadow-xl border border-[#17211F]/15 dark:border-white/15 p-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onToggleExpanded(true);
              setTimeout(() => inputRef.current?.focus(), 120);
            }}
            aria-label="Expand AccessRoute AI Chatbot"
            className="w-10 h-10 rounded-xl bg-[#102B27] dark:bg-[#087F8C] text-[#D3E94D] flex items-center justify-center shrink-0 hover:opacity-90"
          >
            <Bot className="w-5 h-5" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuery(input);
            }}
            className="flex-1 flex items-center gap-1.5 min-w-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask AccessRoute AI..."
              aria-label="Ask AccessRoute AI Chatbot"
              className="flex-1 min-w-0 min-h-[38px] px-2.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] text-xs text-[#17211F] dark:text-[#F7F8F3] placeholder:text-[#17211F]/55 dark:placeholder:text-[#F7F8F3]/55 focus:outline-none focus:ring-2 focus:ring-[#087F8C]"
            />
            {input.trim() ? (
              <button
                type="submit"
                aria-label="Send message"
                className="w-9 h-9 rounded-xl bg-[#087F8C] text-white flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleExpanded(true)}
                aria-label="Open chat window"
                className="w-9 h-9 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 text-[#17211F] dark:text-[#F7F8F3] flex items-center justify-center shrink-0"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      ) : (
        <div
          style={{ maxHeight: 'calc(100vh - 210px)' }}
          className="h-[360px] min-h-[250px] bg-white/95 dark:bg-[#102B27]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#17211F]/15 dark:border-white/15 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-[#102B27] text-white border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#087F8C] text-[#D3E94D] flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold leading-tight truncate">AccessRoute AI Chatbot</h2>
                <p className="text-[11px] text-white/75 truncate">
                  Step-free routes &amp; accessibility help
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleExpanded(false)}
              aria-label="Minimize AI Chatbot"
              title="Minimize chat"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Conversation History */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-2.5">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#087F8C] text-white'
                      : 'bg-[#F7F8F3] dark:bg-[#0D1917] text-[#17211F] dark:text-[#F7F8F3] border border-[#17211F]/10 dark:border-white/10'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.facts && m.facts.length > 0 && (
                    <ul className="mt-2 pt-1.5 border-t border-[#17211F]/10 dark:border-white/10 text-[11px] text-[#17211F]/70 dark:text-[#F7F8F3]/70 space-y-0.5">
                      {m.facts.slice(0, 3).map((f, i) => (
                        <li key={i}>• {f}</li>
                      ))}
                    </ul>
                  )}
                  {m.action && m.action.type !== 'none' && (
                    <button
                      type="button"
                      onClick={() => onExecuteAction(m.action!)}
                      className="mt-2.5 min-h-[36px] px-3 py-1 rounded-xl bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-[11px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                    >
                      Apply on Map
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-[11px] text-[#17211F]/65 dark:text-[#F7F8F3]/65 px-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#087F8C] animate-pulse" />
                Checking live accessibility graph...
              </div>
            )}
          </div>

          {/* Quick Prompt Row */}
          <div className="shrink-0 px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar border-t border-[#17211F]/8 dark:border-white/10 bg-[#F7F8F3]/70 dark:bg-[#0D1917]/60">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendQuery(p)}
                className="whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/10 dark:border-white/15 text-[11px] font-medium text-[#17211F] dark:text-[#F7F8F3] hover:border-[#087F8C] transition-colors"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuery(input);
            }}
            className="shrink-0 p-2.5 flex gap-2 border-t border-[#17211F]/10 dark:border-white/10 bg-white dark:bg-[#102B27]"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about routes, lifts, toilets..."
              aria-label="Ask AccessRoute AI Chatbot"
              className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs text-[#17211F] dark:text-[#F7F8F3] placeholder:text-[#17211F]/50 dark:placeholder:text-[#F7F8F3]/50 focus:outline-none focus:ring-2 focus:ring-[#087F8C]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="min-h-[42px] min-w-[42px] px-3.5 rounded-xl bg-[#087F8C] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#066974] transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
