export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function resolveNextPath(nextPath: string | null, origin: string) {
  if (!nextPath) return "/dashboard";

  // Resolve contra a origem da requisicao: valores como "/\evil.com" ou
  // "//evil.com" sao normalizados pelo parser WHATWG para outra origem.
  let resolved: URL;
  try {
    resolved = new URL(nextPath, origin);
  } catch {
    return "/dashboard";
  }

  if (resolved.origin !== origin) {
    return "/dashboard";
  }

  return resolved.pathname + resolved.search + resolved.hash;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveNextPath(
    requestUrl.searchParams.get("next"),
    requestUrl.origin,
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
