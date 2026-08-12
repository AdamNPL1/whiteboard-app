"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, Headphones, MessageCircle, MessageCircleMore, Send, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type SupportChatbotProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

type ChatMessage = { id: number; role: "assistant" | "user"; text: string };
type Topic = "boards" | "sharing" | "account" | "billing";

const gradient = "linear-gradient(115deg, #7541e8 0%, #5b82e7 55%, #68c58f 100%)";

export default function SupportChatbot({ open, onOpen, onClose }: SupportChatbotProps) {
  const { language, text: t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [launcherHovered, setLauncherHovered] = useState(false);
  const messageId = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, open]);

  const answerFor = (value: string) => {
    const normalized = value.toLocaleLowerCase(language === "pl" ? "pl" : "en");
    if (/board|tablic|create|new board|nowa/.test(normalized)) return t(
      "Open Boards and choose New board. Your work saves automatically while you are signed in.",
      "Otwórz Tablice i wybierz Nowa tablica. Po zalogowaniu Twoja praca zapisuje się automatycznie."
    );
    if (/share|sharing|invite|udost|zapros/.test(normalized)) return t(
      "Find the board and select Share. Enter the other person's registered Scriboo email and send the invitation.",
      "Znajdź tablicę i wybierz Udostępnij. Wpisz adres e-mail zarejestrowanego użytkownika Scriboo i wyślij zaproszenie."
    );
    if (/password|login|account|email|hasł|zalog|konto/.test(normalized)) return t(
      "Use Forgot password in the login window. Account and language settings are under the gear icon.",
      "Użyj opcji Nie pamiętasz hasła w oknie logowania. Konto i język znajdziesz pod ikoną ustawień."
    );
    if (/price|pricing|plan|billing|subscription|płat|cenn|abonament/.test(normalized)) return t(
      "Open Boards and select Your plan to compare Basic, Pro and Master.",
      "Otwórz Tablice i wybierz Twój plan, aby porównać Basic, Pro i Master."
    );
    return t(
      "I can help with boards, sharing, accounts and plans. Choose a topic below or contact the Scriboo team.",
      "Mogę pomóc w sprawach tablic, udostępniania, konta i planów. Wybierz temat poniżej lub napisz do zespołu Scriboo."
    );
  };

  const sendMessage = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { id: messageId.current++, role: "user", text: trimmed },
      { id: messageId.current++, role: "assistant", text: answerFor(trimmed) },
    ]);
    setInput("");
  };

  const topics: Record<Topic, { label: string; prompt: string }> = {
    boards: { label: t("Boards", "Tablice"), prompt: t("How do I create a board?", "Jak utworzyć tablicę?") },
    sharing: { label: t("Sharing", "Udostępnianie"), prompt: t("How do I share a board?", "Jak udostępnić tablicę?") },
    account: { label: t("Account", "Konto"), prompt: t("I need help with my account", "Potrzebuję pomocy z kontem") },
    billing: { label: t("Plans", "Plany"), prompt: t("Tell me about plans", "Opowiedz mi o planach") },
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          onMouseEnter={() => setLauncherHovered(true)}
          onMouseLeave={() => setLauncherHovered(false)}
          onFocus={() => setLauncherHovered(true)}
          onBlur={() => setLauncherHovered(false)}
          aria-label={t("Open Help and Support", "Otwórz pomoc i wsparcie")}
          title={t("Help & Support", "Pomoc i wsparcie")}
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 2147482999,
            width: 48, height: 48, display: "grid", placeItems: "center",
            border: "none", borderRadius: 16,
            background: gradient, backgroundSize: "180% 180%", color: "white", cursor: "pointer",
            boxShadow: launcherHovered ? "0 19px 40px rgba(71,74,153,.38)" : "0 14px 34px rgba(71,74,153,.3)",
            transform: launcherHovered ? "translateY(-4px) scale(1.045)" : "translateY(0) scale(1)",
            backgroundPosition: launcherHovered ? "100% 50%" : "0% 50%",
            transition: "transform 360ms cubic-bezier(.2,.8,.2,1), box-shadow 360ms ease, background-position 850ms ease",
          }}
        >
          <MessageCircleMore size={23} strokeWidth={2.15} />
        </button>
      )}

      {open && (
        <section
          aria-label={t("Scriboo support assistant", "Asystent pomocy Scriboo")}
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 2147483000,
            width: "min(350px, calc(100vw - 28px))", height: "min(500px, calc(100vh - 40px))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            border: "1px solid #dce2ef", borderRadius: 22,
            background: "#fff", color: "#172036",
            boxShadow: "0 28px 75px rgba(30,41,83,.27)",
            fontFamily: "inherit",
          }}
        >
          <header style={{ minHeight: 68, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, background: gradient, color: "white" }}>
            <div style={{ width: 38, height: 38, display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,.4)", borderRadius: 12, background: "rgba(255,255,255,.15)" }}>
              <Headphones size={19} />
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 15, lineHeight: 1.1 }}>Scriboo</strong>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.88)" }}>{t("Support assistant", "Asystent pomocy")}</span>
            </div>
            <button type="button" onClick={onClose} aria-label={t("Close", "Zamknij")} style={{ marginLeft: "auto", width: 34, height: 34, display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,.38)", borderRadius: 11, background: "rgba(255,255,255,.14)", color: "white", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </header>

          <div aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: "16px 14px 10px", display: "flex", flexDirection: "column", gap: 9, background: "linear-gradient(180deg,#f7f8ff,#fff 45%)" }}>
            <div style={{ alignSelf: "flex-start", maxWidth: "86%", padding: "10px 12px", border: "1px solid #e1e6f0", borderRadius: "15px 15px 15px 5px", background: "white", color: "#3c4863", fontSize: 13, lineHeight: 1.45 }}>
              {t("Hi! How can I help you today?", "Cześć! Jak mogę Ci dzisiaj pomóc?")}
            </div>
            {messages.map((message) => (
              <div key={message.id} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "86%", padding: "10px 12px", border: message.role === "user" ? 0 : "1px solid #e1e6f0", borderRadius: message.role === "user" ? "15px 15px 5px 15px" : "15px 15px 15px 5px", background: message.role === "user" ? gradient : "white", color: message.role === "user" ? "white" : "#3c4863", fontSize: 13, lineHeight: 1.45 }}>
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: "7px 12px", display: "flex", gap: 6, overflowX: "auto", borderTop: "1px solid #edf0f7" }}>
            {(Object.keys(topics) as Topic[]).map((topic) => (
              <button key={topic} type="button" onClick={() => sendMessage(topics[topic].prompt)} style={{ flex: "0 0 auto", padding: "6px 9px", border: "1px solid #dce2ef", borderRadius: 999, background: "#fafbff", color: "#58647e", font: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {topics[topic].label}
              </button>
            ))}
          </div>

          <form onSubmit={(event: FormEvent) => { event.preventDefault(); sendMessage(input); }} style={{ margin: "5px 12px 8px", padding: "4px 4px 4px 12px", display: "flex", alignItems: "center", gap: 7, border: "1px solid #d9dfec", borderRadius: 14, background: "white" }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={t("Ask a question…", "Zadaj pytanie…")} aria-label={t("Your question", "Twoje pytanie")} style={{ width: "100%", minWidth: 0, border: 0, outline: 0, background: "transparent", color: "#172036", font: "inherit", fontSize: 13 }} />
            <button type="submit" disabled={!input.trim()} aria-label={t("Send", "Wyślij")} style={{ width: 34, height: 34, flex: "0 0 auto", display: "grid", placeItems: "center", border: 0, borderRadius: 10, background: gradient, color: "white", cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : .42 }}>
              <Send size={16} />
            </button>
          </form>

          <Link href="/support" style={{ margin: "0 12px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#667089", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            <MessageCircle size={13} />{t("Contact human support", "Kontakt z pomocą")}<ExternalLink size={12} />
          </Link>
        </section>
      )}
    </>,
    document.body
  );
}
