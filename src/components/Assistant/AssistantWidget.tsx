import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  ExternalLink,
  HelpCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";

import { sendAssistantChat } from "@/lib/api";
import type { AlertItem, AssistantChatMessage, Prediction, SensorReading } from "@/lib/types";
import type { TransformerComponentId } from "../Transformer3D/types";

interface AssistantWidgetProps {
  reading: SensorReading | null | undefined;
  prediction: Prediction | null | undefined;
  alerts: AlertItem[];
  onFocusComponent?: (componentId: TransformerComponentId) => void;
}

const DEFAULT_SUGGESTIONS = [
  "Why is my transformer showing a warning?",
  "What are the latest temperature and voltage readings?",
  "Is the oil level decreasing?",
  "Which component is associated with the latest alert?",
  "What maintenance checks are recommended?",
  "Explain the latest ML prediction.",
  "Show the component associated with the current fault.",
];

export function AssistantWidget({
  reading,
  prediction,
  alerts,
  onFocusComponent,
}: AssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with a welcoming greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome-1",
          sender: "assistant",
          text: `**Substation Sentinel AI Diagnostic Assistant Ready.**\n\nI monitor telemetry, threshold alarms, and ML predictive health indices for **Bay T1-400kV (315 MVA)**.\n\nAsk any diagnostic question or pick a suggested query below:`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggested_questions: DEFAULT_SUGGESTIONS.slice(0, 4),
          provider: "Substation Sentinel Expert AI Engine",
        },
      ]);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText ?? input).trim();
    if (!textToSend || loading) return;

    const userMsg: AssistantChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendAssistantChat({
        query: textToSend,
        reading,
        prediction,
        alerts,
      });

      const assistantMsg: AssistantChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        affected_component_id: response.affected_component_id,
        affected_component_label: response.affected_component_label,
        provider: response.provider,
        suggested_questions: response.suggested_questions?.length ? response.suggested_questions : DEFAULT_SUGGESTIONS.slice(0, 3),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: AssistantChatMessage = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: "An error occurred while contacting the diagnostic assistant service. You can retry your request.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "assistant",
        text: "Diagnostic conversation cleared. How can I assist you with transformer telemetry or maintenance?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggested_questions: DEFAULT_SUGGESTIONS.slice(0, 4),
      },
    ]);
  };

  // Render markdown-like formatting (bold, bullet points, code blocks)
  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split("\n");
    return lines.map((line, idx) => {
      // Bold rendering
      let processed = line;
      if (line.startsWith("### ")) {
        return (
          <h5 key={idx} className="font-bold text-sm text-foreground mt-2 mb-1">
            {line.replace("### ", "")}
          </h5>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <div key={idx} className="flex items-start gap-1.5 ml-2 my-0.5">
            <span className="text-primary font-bold">•</span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {renderInlineMarkup(line.replace("- ", ""))}
            </span>
          </div>
        );
      }
      if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ") || line.startsWith("4. ")) {
        return (
          <div key={idx} className="flex items-start gap-1.5 ml-2 my-0.5">
            <span className="text-primary font-mono text-[11px] font-semibold">{line.slice(0, 3)}</span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {renderInlineMarkup(line.slice(3))}
            </span>
          </div>
        );
      }
      if (line.trim() === "") {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs text-foreground/90 leading-relaxed my-0.5">
          {renderInlineMarkup(processed)}
        </p>
      );
    });
  };

  const renderInlineMarkup = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="bg-background/80 text-primary px-1.5 py-0.5 rounded font-mono text-[11px] border border-border/60">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 border ${
            isOpen
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/95 hover:bg-card text-foreground border-primary/40 hover:border-primary shadow-primary/10"
          }`}
          title="Open AI Transformer Diagnostic Assistant"
        >
          <div className="relative">
            <Bot className="h-5 w-5 text-primary-foreground sm:text-inherit" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-healthy" />
            </span>
          </div>
          <span className="font-medium text-xs hidden sm:inline tracking-tight">AI Assistant</span>
        </button>
      </div>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[460px] h-[600px] max-h-[85vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="border-b border-border p-3.5 bg-card/90 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/15 text-primary border border-primary/30">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">AI Transformer Assistant</h4>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                    ONLINE
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Digital Twin Diagnostic Intelligence
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                onClick={handleClearHistory}
                className="p-1.5 rounded hover:bg-accent hover:text-foreground transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded hover:bg-accent hover:text-foreground transition-colors"
                title="Close Assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/40">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-muted-foreground font-mono">
                  {m.sender === "user" ? (
                    <>
                      <span>Operator</span>
                      <User className="h-3 w-3 text-muted-foreground" />
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 text-primary" />
                      <span>{m.provider ?? "Sentinel AI Engine"}</span>
                    </>
                  )}
                  <span>· {m.timestamp}</span>
                </div>

                <div
                  className={`relative max-w-[92%] rounded-xl px-3.5 py-3 text-xs leading-relaxed border ${
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground border-primary/60 font-medium"
                      : m.isError
                      ? "bg-destructive/15 text-destructive border-destructive/40"
                      : "bg-card border-border shadow-sm text-foreground"
                  }`}
                >
                  {m.sender === "assistant" ? renderFormattedText(m.text) : m.text}

                  {/* Component navigation button if mapped */}
                  {m.affected_component_id && onFocusComponent && (
                    <div className="mt-3 pt-2.5 border-t border-border/60">
                      <button
                        onClick={() => {
                          onFocusComponent(m.affected_component_id as TransformerComponentId);
                          // Provide subtle feedback
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/40 font-semibold text-xs transition-colors"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>View Affected Component ({m.affected_component_label ?? m.affected_component_id})</span>
                      </button>
                    </div>
                  )}

                  {/* Copy helper */}
                  {m.sender === "assistant" && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => handleCopy(m.id, m.text)}
                        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        title="Copy diagnostic text"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="h-3 w-3 text-healthy" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Suggested questions chips under assistant message */}
                {m.suggested_questions && m.suggested_questions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 max-w-[95%]">
                    {m.suggested_questions.map((sq, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(sq)}
                        disabled={loading}
                        className="text-[10px] text-left px-2.5 py-1 rounded-full border border-border/80 bg-card/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors leading-tight"
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex flex-col items-start space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono px-1">
                  <Bot className="h-3 w-3 text-primary animate-spin" />
                  <span>Analyzing substation telemetry & running ML diagnostics...</span>
                </div>
                <div className="rounded-xl px-4 py-3 bg-card border border-border text-xs text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Synthesizing diagnostic recommendations...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="border-t border-border p-3 bg-card/90 space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about temperature, oil, alerts, or components..."
                disabled={loading}
                className="flex-1 bg-background/80 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Send query"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
              <span>IEEE C57 / IEC 60076 Compliant</span>
              <span>Substation Digital Twin v2.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
