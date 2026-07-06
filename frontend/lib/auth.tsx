"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, setToken } from "./api";
import type { TokenResponse, User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    invite_code: string;
    email: string;
    name: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<TokenResponse>("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    setToken(res.access_token);
    await refresh();
  }, [refresh]);

  const register = useCallback(
    async (input: { invite_code: string; email: string; name: string; password: string }) => {
      const res = await api<TokenResponse>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: input,
      });
      setToken(res.access_token);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
