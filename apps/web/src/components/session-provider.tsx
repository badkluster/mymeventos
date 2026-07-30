'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutRequest, type SessionUser } from '@/lib/auth';

type Session = {
  user: SessionUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  establishSession: (user: SessionUser) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, checkSession = true }: { children: ReactNode; checkSession?: boolean }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(checkSession);
  const [sessionChecked, setSessionChecked] = useState(!checkSession);

  const establishSession = (nextUser: SessionUser) => {
    setUser(nextUser);
    setSessionChecked(true);
    setLoading(false);
  };

  const refreshSession = async () => {
    setLoading(true);
    try {
      setUser(await getCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setSessionChecked(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checkSession || sessionChecked) return;
    let mounted = true;
    void getCurrentUser()
      .then((nextUser) => { if (mounted) setUser(nextUser); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => {
        if (!mounted) return;
        setSessionChecked(true);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [checkSession, sessionChecked]);

  const logout = async () => {
    await logoutRequest();
    setUser(null);
    setSessionChecked(true);
    setLoading(false);
  };

  return <SessionContext.Provider value={{ user, loading, isAuthenticated: Boolean(user), establishSession, refreshSession, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
