import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  // During SSR/build, env vars might not be available yet
  // Return a client that will work once hydrated on the browser
  if (!url || !key) {
    // Use placeholder - will be replaced at runtime with real env vars
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    )
  }

  client = createBrowserClient(url, key)
  return client
}
