/**
 * Browser calls go to `/api` (Next route handler) so JWT cookies stay same-origin.
 * Server Components cannot fetch a relative URL — Node's fetch requires an
 * absolute origin, so they talk to the Elysia server directly.
 *
 * Access JWTs last 15 minutes. The API mints a new one from `cf_refresh` when
 * the access cookie is missing or expired. The browser still retries a 401
 * through `/auth/refresh` so Set-Cookie lands on this origin, and a keep-alive
 * pings refresh while the tab is open.
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

const SKIP_REFRESH = new Set(["/auth/refresh", "/auth/login", "/auth/logout", "/auth/register"]);

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetch(`${apiBase()}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Keep the 15-minute access cookie alive while this tab is open. */
export function startSessionKeepAlive(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const ping = () => {
    void refreshSession();
  };
  const interval = window.setInterval(ping, 10 * 60 * 1000);
  const onVisible = () => {
    if (document.visibilityState === "visible") ping();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

async function readError(response: Response): Promise<string> {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // keep the status line
  }
  return message;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const cookie = await incomingCookieHeader();
  if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);

  const send = () =>
    fetch(`${apiBase()}${path}`, {
      ...init,
      credentials: "include",
      headers,
      cache: "no-store",
    });

  let response = await send();
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    !SKIP_REFRESH.has(path)
  ) {
    if (await refreshSession()) response = await send();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
