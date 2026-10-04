"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CustomerProfile } from "@/lib/customer";

interface SessionState {
  customer: CustomerProfile | null;
  status: "loading" | "ready";
  /** Total units in the cart, for the header badge. */
  cartCount: number;
  setCustomer: (customer: CustomerProfile | null) => void;
  setCartCount: (count: number) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Client-side view of the signed-in customer and cart count, loaded from /api/me
 * so pages themselves stay cacheable. Auth and cart actions update it directly.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomerState] = useState<CustomerProfile | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = (await res.json()) as { customer: CustomerProfile | null; cartCount: number };
      setCustomerState(json.customer);
      setCartCount(json.cartCount);
    } catch {
      setCustomerState(null);
      setCartCount(0);
    } finally {
      setStatus("ready");
    }
  }, []);

  const setCustomer = useCallback(
    (next: CustomerProfile | null) => {
      setCustomerState(next);
      // Signing in may bring an existing cart; signing out empties the badge.
      if (next) void refresh();
      else setCartCount(0);
    },
    [refresh],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of external (server) session state
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ customer, status, cartCount, setCustomer, setCartCount, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
