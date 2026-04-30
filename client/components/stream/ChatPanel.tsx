"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { io, Socket } from "socket.io-client";
import { getAccessToken, API_ORIGIN, apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface UserMessage {
  id: string;
  type: "user";
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
}

interface SystemEventMessage {
  id: string;
  type: "system";
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: string;
}

type ChatItem = UserMessage | SystemEventMessage;

interface ChatPanelProps {
  streamId: string;
  socket?: Socket | null;
  variant?: "light" | "dark";
}

const MAX_KEEP = 200;

export function ChatPanel({ streamId, socket: externalSocket, variant = "light" }: ChatPanelProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [stickToBottom, setStickToBottom] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);

  // Load history
  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}/chat`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setMessages(data.messages ?? []);
        }
      } catch {
        // silent
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  // Subscribe to chat events
  useEffect(() => {
    if (externalSocket !== undefined) {
      socketRef.current = externalSocket;
      if (externalSocket) {
        // Mirror the socket's current connection state into local state so
        // the UI shows the right "Live" badge from the start.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConnected(externalSocket.connected);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onMessage = (msg: ChatItem) => {
          setMessages((prev) => [...prev, msg].slice(-MAX_KEEP));
        };
        const onError = (data: { message: string }) => {
          setError(data.message);
          setTimeout(() => setError(""), 3000);
        };

        externalSocket.on("connect", onConnect);
        externalSocket.on("disconnect", onDisconnect);
        externalSocket.on("chat:message", onMessage);
        externalSocket.on("chat:error", onError);
        return () => {
          externalSocket.off("connect", onConnect);
          externalSocket.off("disconnect", onDisconnect);
          externalSocket.off("chat:message", onMessage);
          externalSocket.off("chat:error", onError);
        };
      }
      return;
    }

    // Standalone socket fallback (chat panel used without parent socket).
    const token = getAccessToken();
    if (authLoading || !token) return;
    const socket = io(API_ORIGIN, { auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("stream:join", streamId);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("chat:message", (msg: ChatItem) => {
      setMessages((prev) => [...prev, msg].slice(-MAX_KEEP));
    });
    socket.on("chat:error", (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(""), 3000);
    });
    return () => {
      socket.emit("stream:leave", streamId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [streamId, externalSocket, authLoading]);

  // Auto-scroll: stick to bottom unless user scrolled up.
  useEffect(() => {
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, stickToBottom]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom < 60);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit("chat:send", { streamId, text: trimmed });
    setInput("");
    setStickToBottom(true);
  };

  const isDark = variant === "dark";

  return (
    <div className={cn("flex flex-col h-full", isDark && "text-white")}>
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 border-b",
          isDark ? "border-white/10" : "border-border"
        )}
      >
        <h3 className="text-sm font-semibold">Chat</h3>
        {connected && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Live
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 chat-scroll"
      >
        {messages.length === 0 && (
          <p
            className={cn(
              "text-sm text-center mt-4",
              isDark ? "text-white/50" : "text-muted-foreground"
            )}
          >
            No messages yet. Say something!
          </p>
        )}
        {messages.map((msg) =>
          msg.type === "system" ? (
            <SystemRow key={msg.id} msg={msg} dark={isDark} />
          ) : (
            <UserRow key={msg.id} msg={msg} dark={isDark} />
          )
        )}
      </div>

      {error && (
        <div className="px-3 py-1 text-xs text-destructive bg-destructive/10">{error}</div>
      )}

      {user ? (
        <form
          onSubmit={handleSend}
          className={cn("p-3 border-t", isDark ? "border-white/10" : "border-border")}
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say something..."
              maxLength={500}
              className={
                isDark
                  ? "flex-1 h-9 px-3 rounded-lg border border-white/15 bg-white/5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
                  : "flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              }
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <div
          className={cn(
            "p-3 border-t text-center",
            isDark ? "border-white/10" : "border-border"
          )}
        >
          <p
            className={cn(
              "text-xs",
              isDark ? "text-white/50" : "text-muted-foreground"
            )}
          >
            Log in to chat
          </p>
        </div>
      )}

      <style jsx>{`
        :global(.chat-scroll > *) {
          animation: chat-fade-in 200ms ease-out;
        }
        @keyframes chat-fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function UserRow({ msg, dark }: { msg: UserMessage; dark: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {msg.avatarUrl ? (
        <Image
          src={msg.avatarUrl}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 rounded-full mt-0.5 shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground mt-0.5 shrink-0">
          {(msg.displayName ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
      <p className="min-w-0 text-xs leading-snug">
        <span className={cn("font-semibold", dark ? "text-white" : "text-foreground")}>
          {msg.username}
        </span>
        <span className={cn("ml-1.5", dark ? "text-white/70" : "text-muted-foreground")}>
          {msg.text}
        </span>
      </p>
    </div>
  );
}

function formatDollars(cents: unknown): string {
  const n = typeof cents === "number" ? cents : 0;
  if (n % 100 === 0) return `$${n / 100}`;
  return `$${(n / 100).toFixed(2)}`;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function SystemRow({ msg, dark }: { msg: SystemEventMessage; dark: boolean }) {
  const e = msg.eventData;
  let label: React.ReactNode = null;

  switch (msg.eventType) {
    case "user_joined": {
      const u = asString(e.username);
      const batch = asNumber(e.batchCount);
      label =
        batch > 1 ? (
          <>👋 {batch} viewers joined</>
        ) : (
          <>
            👋 <Bold dark={dark}>@{u}</Bold> joined
          </>
        );
      break;
    }
    case "user_followed":
      label = (
        <>
          ⭐ <Bold dark={dark}>@{asString(e.followerUsername)}</Bold> followed
        </>
      );
      break;
    case "auction_started":
      label = (
        <>
          🔥 Spot #{asNumber(e.spotNumber)} auction started — {formatDollars(e.startingBid)} starting
        </>
      );
      break;
    case "new_bid":
      label = (
        <>
          📈 <Bold dark={dark}>@{asString(e.bidderUsername)}</Bold> bid {formatDollars(e.amount)} on Spot #
          {asNumber(e.spotNumber)}
        </>
      );
      break;
    case "timer_extended":
      label = <>⏰ Timer extended on Spot #{asNumber(e.spotNumber)}</>;
      break;
    case "spot_won":
      label = (
        <>
          🏆 <Bold dark={dark}>@{asString(e.winnerUsername)}</Bold> won Spot #
          {asNumber(e.spotNumber)} for {formatDollars(e.soldPrice)}
        </>
      );
      break;
    case "spot_purchased":
      label = (
        <>
          💰 <Bold dark={dark}>@{asString(e.buyerUsername)}</Bold> got Spot #
          {asNumber(e.spotNumber)} for {formatDollars(e.soldPrice)}
        </>
      );
      break;
    case "spot_revealed":
      label = (
        <>
          🎉 <Bold dark={dark}>@{asString(e.winnerUsername) || "buyer"}</Bold>&rsquo;s Spot #
          {asNumber(e.spotNumber)}: <span className="text-primary font-semibold">{asString(e.revealText)}</span>
        </>
      );
      break;
    case "break_started":
      label = (
        <>
          🚀 <Bold dark={dark}>{asString(e.breakName)}</Bold> is now live!
        </>
      );
      break;
    case "break_completed":
      label = (
        <>
          ✅ Break completed — {asNumber(e.winnerCount)}{" "}
          {asNumber(e.winnerCount) === 1 ? "winner" : "winners"}!
        </>
      );
      break;
    default:
      return null;
  }

  return (
    <div
      className={cn(
        "px-2.5 py-1.5 rounded-md text-xs italic",
        dark
          ? "bg-white/[0.04] text-white/70 border-l-2 border-primary/40"
          : "bg-secondary/60 text-muted-foreground border-l-2 border-primary/40"
      )}
    >
      {label}
    </div>
  );
}

function Bold({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <span className={cn("not-italic font-semibold", dark ? "text-white" : "text-foreground")}>
      {children}
    </span>
  );
}
