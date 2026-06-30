import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/supabase-public-env";
import { getSupabaseServiceRoleKey } from "@/lib/supabase-service-role-env";

let supabaseServerClient: SupabaseClient | null = null;
let supabaseServiceRoleClient: SupabaseClient | null = null;

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

export const getSupabaseServiceRoleClient = () => {
  if (!supabaseServiceRoleClient) {
    supabaseServiceRoleClient = createClient(
      getSupabaseUrl(),
      getSupabaseServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseServiceRoleClient;
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
