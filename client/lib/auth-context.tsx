"use client";

import { createContext, useCallback, useEffect, useState, ReactNode } from "react";
import { apiFetch, setAccessToken, API_BASE } from "./api";

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isSellerEnabled: boolean;
  walletBalance: number;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);

          const meRes = await apiFetch("/auth/me");
          if (meRes.ok) {
            const meData = await meRes.json();
            setUser(meData.user);
          }
        }
      } catch {
        // No session
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Login failed");
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const signup = useCallback(
    async (input: {
      email: string;
      username: string;
      password: string;
      displayName: string;
    }) => {
      const res = await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...input, email: input.email.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Signup failed");
      }
      const data = await res.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch("/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // Failed to refresh user
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
