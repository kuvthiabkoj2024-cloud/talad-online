import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, setApiToken, setUnauthorizedHandler, type CustomerProfile } from './api';
import { storage } from './storage';

const KEY = 'mcmart.session';

interface Auth {
  /** The saved session has been checked (show the app only after this). */
  ready: boolean;
  customer: CustomerProfile | null;
  signIn: (token: string, customer: CustomerProfile) => Promise<void>;
  signOut: () => Promise<void>;
  /** After editing the profile (name, email, photo). */
  updateCustomer: (customer: CustomerProfile) => void;
}

const AuthContext = createContext<Auth>({ ready: false, customer: null, signIn: async () => {}, signOut: async () => {}, updateCustomer: () => {} });

/** The customer's session: its token lives in the phone's secure store and goes with every API call. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);

  const forget = useCallback(async () => {
    setApiToken(null);
    setCustomer(null);
    await storage.set(KEY, null);
    queryClient.removeQueries({ queryKey: ['me'] });
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => void forget());
    void (async () => {
      const token = await storage.get(KEY);
      if (token) {
        setApiToken(token);
        try {
          setCustomer(await api<CustomerProfile>('/auth/customer/me'));
        } catch {
          // Expired or revoked (cleared by the 401 handler), or offline: start signed out either way.
          setApiToken(null);
        }
      }
      setReady(true);
    })();
  }, [forget]);

  const signIn = useCallback(
    async (token: string, profile: CustomerProfile) => {
      setApiToken(token);
      await storage.set(KEY, token);
      setCustomer(profile);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api('/auth/customer/logout', { method: 'POST' }).catch(() => {});
    await forget();
  }, [forget]);

  return <AuthContext value={{ ready, customer, signIn, signOut, updateCustomer: setCustomer }}>{children}</AuthContext>;
}

export const useAuth = () => useContext(AuthContext);
