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

  const requestHeaders = copyHeaders(request.headers);
  const init: RequestInit = {
    method: request.method,
    headers: requestHeaders,
    redirect: "manual",
    cache: "no-store",
  };
  // Buffer the body. Streaming `request.body` with duplex:"half" can hang or
  // reset against Bun (UND_ERR_SOCKET after ~30s) on empty POSTs like run-digest.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) {
      init.body = buffer;
      requestHeaders.set("content-length", String(buffer.byteLength));
    } else {
      requestHeaders.delete("content-length");
    }
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

  const responseHeaders = copyHeaders(upstream.headers, true);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
