"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
}

interface ChatPanelProps {
  streamId: string;
  socket?: Socket | null;
}

export function ChatPanel({ streamId, socket: externalSocket }: ChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}/chat`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages);
        }
      } catch {
        // Failed to load history
      }
    };
    loadHistory();
  }, [streamId]);

  // Use external socket if provided, otherwise create our own
  useEffect(() => {
    if (externalSocket !== undefined) {
      // Use externally provided socket (may be null while connecting)
      socketRef.current = externalSocket;

      if (externalSocket) {
        setConnected(externalSocket.connected);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onChatMessage = (msg: ChatMessage) => {
          setMessages((prev) => {
            const updated = [...prev, msg];
            return updated.length > 200 ? updated.slice(-200) : updated;
          });
        };
        const onChatError = (data: { message: string }) => {
          setError(data.message);
          setTimeout(() => setError(""), 3000);
        };

        externalSocket.on("connect", onConnect);
        externalSocket.on("disconnect", onDisconnect);
        externalSocket.on("chat:message", onChatMessage);
        externalSocket.on("chat:error", onChatError);

        return () => {
          externalSocket.off("connect", onConnect);
          externalSocket.off("disconnect", onDisconnect);
          externalSocket.off("chat:message", onChatMessage);
          externalSocket.off("chat:error", onChatError);
        };
      }
      return;
    }

    // No external socket provided — create our own
    const token = getAccessToken();
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("stream:join", streamId);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => {
        const updated = [...prev, msg];
        return updated.length > 200 ? updated.slice(-200) : updated;
      });
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
  }, [streamId, externalSocket]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !socketRef.current) return;

    socketRef.current.emit("chat:send", { streamId, text: trimmed });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Chat</h3>
        {connected && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            Live
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            No messages yet. Say something!
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2">
            {msg.avatarUrl ? (
              <img src={msg.avatarUrl} alt="" className="w-6 h-6 rounded-full mt-0.5 shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground mt-0.5 shrink-0">
                {msg.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <span className="text-xs font-semibold text-foreground">{msg.username}</span>
              <span className="text-xs text-muted-foreground ml-1">{msg.text}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-xs text-destructive bg-destructive/10">{error}</div>
      )}

      {/* Input */}
      {user ? (
        <form onSubmit={handleSend} className="p-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say something..."
              maxLength={500}
              className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
        <div className="p-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">Log in to chat</p>
        </div>
      )}
    </div>
  );
}
