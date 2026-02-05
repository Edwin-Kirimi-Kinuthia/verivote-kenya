"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { AuthData } from "@/lib/types";

interface AuthContextValue {
  token: string | null;
  voter: AuthData["voter"] | null;
  isLoading: boolean;
  login: (token: string, voter: AuthData["voter"]) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [voter, setVoter] = useState<AuthData["voter"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    const storedVoter = localStorage.getItem("voter");
    if (stored && storedVoter) {
      setToken(stored);
      try {
        setVoter(JSON.parse(storedVoter));
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("voter");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((token: string, voter: AuthData["voter"]) => {
    localStorage.setItem("token", token);
    localStorage.setItem("voter", JSON.stringify(voter));
    setToken(token);
    setVoter(voter);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("voter");
    setToken(null);
    setVoter(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, voter, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
