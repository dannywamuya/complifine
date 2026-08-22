/**
 * Browser calls go to `/api` (Next rewrite) so JWT cookies stay same-origin.
 * Server Components cannot fetch a relative URL — Node's fetch requires an
 * absolute origin, so they talk to the Elysia server directly.
 */

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function apiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/$/, "");
  if (typeof window !== "undefined") return configured || "/api";
  if (isAbsolute(configured)) return configured;
  return (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3311").replace(/\/$/, "");
}

async function incomingCookieHeader(): Promise<string | undefined> {
  if (typeof window !== "undefined") return undefined;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const value = jar
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    return value || undefined;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const cookie = await incomingCookieHeader();
  if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);

  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status line
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
