import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseServerClient: SupabaseClient | null = null;

export const getSupabaseUrl = () => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  return value;
};

export const getSupabaseAnonKey = () => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return value;
};

export const getSupabaseServerClient = () => {
  if (!supabaseServerClient) {
    supabaseServerClient = createClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseServerClient;
};

type SupabaseAuthCookieStore = {
  getAll: () =>
    Array<{
      name: string;
      value: string;
    }>;
  setAll?: (
    cookies: Array<{
      name: string;
      value: string;
      options: CookieOptions;
    }>
  ) => void;
};

export const createSupabaseServerAuthClient = (
  cookieStore: SupabaseAuthCookieStore
) =>
  createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookieStore.setAll?.(cookiesToSet);
      },
    },
  });
