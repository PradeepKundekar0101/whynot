"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { io, Socket } from "socket.io-client";
import { Mic, Users } from "lucide-react";
import { getAccessToken, API_ORIGIN, apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * Three-tab right rail used on every stream page (buyer + seller).
 *
 *   Chat     — user messages + join/leave system events
 *   Watching — live presence list (seller pinned, viewers below)
 *   Activity — auction, bid, sale, reveal, follow events
 *
 * Owns its own socket fallback so the panel works even when used standalone
 * (ChatPanel parity), but prefers an externally-passed socket so it shares
 * the same connection as the rest of the page.
 */

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

export interface ViewerInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isSeller: boolean;
}

interface StreamRightPanelProps {
  streamId: string;
  socket?: Socket | null;
  variant?: "light" | "dark";
  /** Optional content shown above the tab strip (e.g. wallet chip, show stats). */
  headerSlot?: React.ReactNode;
}

const MAX_KEEP = 300;
const TABS = ["chat", "watching", "activity"] as const;
type TabId = (typeof TABS)[number];

const CHAT_EVENT_TYPES = new Set(["user_joined", "user_left"]);

export function StreamRightPanel({
  streamId,
  socket: externalSocket,
  variant = "light",
  headerSlot,
}: StreamRightPanelProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [stickToBottom, setStickToBottom] = useState(true);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDark = variant === "dark";

  // ── Initial loads ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [chatRes, viewersRes] = await Promise.all([
          apiFetch(`/streams/${streamId}/chat`),
          apiFetch(`/streams/${streamId}/viewers`),
        ]);
        if (!cancelled && chatRes.ok) {
          const data = await chatRes.json();
          setMessages(data.messages ?? []);
        }
        if (!cancelled && viewersRes.ok) {
          const data = await viewersRes.json();
          setViewers(data.viewers ?? []);
        }
      } catch {
        // silent — surface failures only when interaction happens
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  // ── Socket subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (externalSocket !== undefined) {
      socketRef.current = externalSocket;
      if (externalSocket) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConnected(externalSocket.connected);

        const onConnect = () => {
          setConnected(true);
          externalSocket.emit("viewer:list:request", streamId);
        };
        const onDisconnect = () => setConnected(false);
        const onMessage = (msg: ChatItem) => {
          setMessages((prev) => [...prev, msg].slice(-MAX_KEEP));
        };
        const onViewerList = (data: { streamId: string; viewers: ViewerInfo[] }) => {
          if (data.streamId === streamId) setViewers(data.viewers);
        };
        const onChatError = (data: { message: string }) => {
          setError(data.message);
          setTimeout(() => setError(""), 3000);
        };

        externalSocket.on("connect", onConnect);
        externalSocket.on("disconnect", onDisconnect);
        externalSocket.on("chat:message", onMessage);
        externalSocket.on("viewer:list", onViewerList);
        externalSocket.on("chat:error", onChatError);

        if (externalSocket.connected) {
          externalSocket.emit("viewer:list:request", streamId);
        }

        return () => {
          externalSocket.off("connect", onConnect);
          externalSocket.off("disconnect", onDisconnect);
          externalSocket.off("chat:message", onMessage);
          externalSocket.off("viewer:list", onViewerList);
          externalSocket.off("chat:error", onChatError);
        };
      }
      return;
    }

    // Standalone socket fallback (panel mounted without parent socket).
    const token = getAccessToken();
    if (authLoading || !token) return;
    const sock = io(API_ORIGIN, { auth: { token } });
    socketRef.current = sock;
    sock.on("connect", () => {
      setConnected(true);
      sock.emit("stream:join", streamId);
      sock.emit("viewer:list:request", streamId);
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("chat:message", (msg: ChatItem) => {
      setMessages((prev) => [...prev, msg].slice(-MAX_KEEP));
    });
    sock.on("viewer:list", (data: { streamId: string; viewers: ViewerInfo[] }) => {
      if (data.streamId === streamId) setViewers(data.viewers);
    });
    sock.on("chat:error", (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(""), 3000);
    });
    return () => {
      sock.emit("stream:leave", streamId);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [streamId, externalSocket, authLoading]);

  // Stick to bottom unless the user scrolled up.
  useEffect(() => {
    if (activeTab === "watching") return;
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, stickToBottom, activeTab]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activeTab === "watching") return;
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

  const chatMessages = useMemo(
    () =>
      messages.filter(
        (m) => m.type === "user" || (m.type === "system" && CHAT_EVENT_TYPES.has(m.eventType))
      ),
    [messages]
  );
  const activityMessages = useMemo(
    () =>
      messages.filter(
        (m) => m.type === "system" && !CHAT_EVENT_TYPES.has(m.eventType)
      ),
    [messages]
  );

  const sortedViewers = useMemo(() => {
    const seller = viewers.find((v) => v.isSeller);
    const others = viewers
      .filter((v) => !v.isSeller)
      .sort((a, b) => a.username.localeCompare(b.username));
    return seller ? [seller, ...others] : others;
  }, [viewers]);

  const tabCounts: Record<TabId, number> = {
    chat: chatMessages.length,
    watching: viewers.length,
    activity: activityMessages.length,
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isDark && "text-white"
      )}
    >
      {headerSlot}

      {/* Tab strip */}
      <div
        className={cn(
          "flex items-stretch border-b shrink-0",
          isDark ? "border-white/10" : "border-border"
        )}
      >
        {TABS.map((id) => {
          const active = id === activeTab;
          const count = tabCounts[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 h-10 text-xs font-semibold transition-colors capitalize",
                active
                  ? isDark
                    ? "text-white border-b-2 border-primary -mb-px"
                    : "text-foreground border-b-2 border-primary -mb-px"
                  : isDark
                    ? "text-white/50 hover:text-white"
                    : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={active}
            >
              <span>{id}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 rounded-full leading-tight tabular-nums",
                    active
                      ? "bg-primary/20 text-primary"
                      : isDark
                        ? "bg-white/10 text-white/70"
                        : "bg-secondary text-foreground"
                  )}
                >
                  {count}
                </span>
              )}
              {!active && id === "chat" && connected && (
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 chat-scroll min-h-0"
      >
        {activeTab === "chat" && (
          <>
            {chatMessages.length === 0 ? (
              <p
                className={cn(
                  "text-sm text-center mt-6",
                  isDark ? "text-white/50" : "text-muted-foreground"
                )}
              >
                No messages yet. Say hi!
              </p>
            ) : (
              <div className="space-y-1.5">
                {chatMessages.map((msg) =>
                  msg.type === "user" ? (
                    <UserRow key={msg.id} msg={msg} dark={isDark} />
                  ) : (
                    <SystemRow key={msg.id} msg={msg} dark={isDark} />
                  )
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "watching" && (
          <ViewerList viewers={sortedViewers} dark={isDark} />
        )}

        {activeTab === "activity" && (
          <>
            {activityMessages.length === 0 ? (
              <p
                className={cn(
                  "text-sm text-center mt-6",
                  isDark ? "text-white/50" : "text-muted-foreground"
                )}
              >
                Show activity will appear here once breaks start.
              </p>
            ) : (
              <div className="space-y-1.5">
                {activityMessages.map((msg) =>
                  msg.type === "system" ? (
                    <SystemRow key={msg.id} msg={msg} dark={isDark} />
                  ) : null
                )}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="px-3 py-1 text-xs text-destructive bg-destructive/10 shrink-0">
          {error}
        </div>
      )}

      {/* Composer (chat only) */}
      {activeTab === "chat" && (
        user ? (
          <form
            onSubmit={handleSend}
            className={cn(
              "p-3 border-t shrink-0",
              isDark ? "border-white/10" : "border-border"
            )}
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
              "p-3 border-t text-center shrink-0",
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
        )
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

function ViewerList({ viewers, dark }: { viewers: ViewerInfo[]; dark: boolean }) {
  if (viewers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <Users className={cn("h-6 w-6", dark ? "text-white/40" : "text-muted-foreground")} />
        <p className={cn("text-sm", dark ? "text-white/60" : "text-muted-foreground")}>
          No one connected yet.
        </p>
      </div>
    );
  }

  const seller = viewers.find((v) => v.isSeller);
  const others = viewers.filter((v) => !v.isSeller);

  return (
    <div className="flex flex-col gap-1.5">
      {seller && (
        <div>
          <p
            className={cn(
              "text-[10px] uppercase tracking-wider mb-1",
              dark ? "text-white/40" : "text-muted-foreground"
            )}
          >
            Seller
          </p>
          <ViewerRow viewer={seller} dark={dark} highlight />
        </div>
      )}
      <div className="mt-2">
        <p
          className={cn(
            "text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5",
            dark ? "text-white/40" : "text-muted-foreground"
          )}
        >
          Buyers
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 rounded-full leading-tight tabular-nums",
              dark ? "bg-white/10 text-white/70" : "bg-secondary text-foreground"
            )}
          >
            {others.length}
          </span>
        </p>
        {others.length === 0 ? (
          <p className={cn("text-xs", dark ? "text-white/40" : "text-muted-foreground")}>
            No buyers connected yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {others.map((v) => (
              <ViewerRow key={v.id} viewer={v} dark={dark} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewerRow({
  viewer,
  dark,
  highlight,
}: {
  viewer: ViewerInfo;
  dark: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-lg",
        highlight && (dark ? "bg-primary/10 border border-primary/30" : "bg-primary/5 border border-primary/30"),
        !highlight && (dark ? "hover:bg-white/5" : "hover:bg-secondary/60")
      )}
    >
      {viewer.avatarUrl ? (
        <Image
          src={viewer.avatarUrl}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 rounded-full shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
          {(viewer.displayName ?? viewer.username).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold truncate", dark ? "text-white" : "text-foreground")}>
          {viewer.displayName || viewer.username}
        </p>
        <p className={cn("text-xs truncate", dark ? "text-white/50" : "text-muted-foreground")}>
          @{viewer.username}
        </p>
      </div>
      {viewer.isSeller && (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-primary">
          <Mic className="h-3 w-3" />
          Host
        </span>
      )}
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
          {(msg.displayName ?? msg.username ?? "?").charAt(0).toUpperCase()}
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
    case "user_left": {
      const u = asString(e.username);
      const batch = asNumber(e.batchCount);
      label =
        batch > 1 ? (
          <>👋 {batch} viewers left</>
        ) : (
          <>
            👋 <Bold dark={dark}>@{u}</Bold> left
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
