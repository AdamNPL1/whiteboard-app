"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-public-env";

let supabaseBrowserClient: SupabaseClient | null = null;

export const getSupabaseBrowserClient = () => {
  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createBrowserClient(
      getSupabaseUrl(),
      getSupabaseAnonKey()
    );
  }

  return supabaseBrowserClient;
};
