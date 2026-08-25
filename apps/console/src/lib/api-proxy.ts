/**
 * Runtime reverse proxy from this Next origin `/api/*` to the Elysia server.
 *
 * Next rewrites bake the upstream URL at build time. Railway's private
 * hostname and PORT are only known at runtime, so the proxy lives here.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function apiProxyTarget(): string {
  return (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3311").replace(/\/$/, "");
}

function copyHeaders(from: Headers, setCookie = false): Headers {
  const headers = new Headers();
  from.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (!setCookie && key.toLowerCase() === "set-cookie") return;
    headers.append(key, value);
  });
  if (setCookie && typeof from.getSetCookie === "function") {
    for (const cookie of from.getSetCookie()) headers.append("Set-Cookie", cookie);
  }
  return headers;
}

export async function proxyToApi(request: Request, path: string[]): Promise<Response> {
  const origin = apiProxyTarget();
  const search = new URL(request.url).search;
  const target = `${origin}/${path.map(encodeURIComponent).join("/")}${search}`;

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: copyHeaders(request.headers),
    redirect: "manual",
    cache: "no-store",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    console.error(`API proxy ${request.method} ${target}`, error);
    return Response.json(
      {
        error:
          `Cannot reach the API at ${origin}. On Railway set API_PROXY_TARGET to ` +
          `http://\${{<api-service-name>.RAILWAY_PRIVATE_DOMAIN}}:\${{<api-service-name>.PORT}} ` +
          `on this service (runtime, not a Docker build arg).`,
      },
      { status: 502 },
    );
  }

  const headers = copyHeaders(upstream.headers, true);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
