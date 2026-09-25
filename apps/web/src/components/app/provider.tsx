'use client';

import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Language } from '@/lib/i18n';

export interface AppState {
  supabase: SupabaseClient;
  user: User;
  tenantId: string;
  tenantName: string;
  role: string;
  currency: string;
  language: Language;
  timezone: string;
  isPlatformAdmin: boolean;
  setTenantId: (id: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

interface ProviderProps {
  children: React.ReactNode;
  user: User;
  tenantId: string;
  tenantName: string;
  role: string;
  currency: string;
  language: Language;
  timezone: string;
  isPlatformAdmin: boolean;
}

export function AppProvider({
  children,
  user,
  tenantId,
  tenantName,
  role,
  currency,
  language,
  timezone,
  isPlatformAdmin,
}: ProviderProps) {
  const supabase = useMemo(() => createClient(), []);
  const [currentTenantId, setCurrentTenantId] = useState(tenantId);

  const setTenantId = useCallback((id: string) => {
    document.cookie = `tenant_id=${id}; path=/; max-age=31536000; SameSite=Lax`;
    setCurrentTenantId(id);
    window.location.reload();
  }, []);

  return (
    <AppContext.Provider
      value={{
        supabase,
        user,
        tenantId: currentTenantId,
        tenantName,
        role,
        currency,
        language,
        timezone,
        isPlatformAdmin,
        setTenantId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}