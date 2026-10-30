/**
 * Better Auth oauth-provider returns JSON { redirect, url } for fetch callers
 * and a real 302 for top-level navigations. MCP hosts open oauth2/authorize
 * as a browser document; if that response is JSON, the user sees raw JSON
 * instead of being sent to Studio login/consent.
 *
 * Live probes: Chrome-like Accept text/html got JSON 200; curl default Accept
 * got 302. This shim normalizes navigation-shaped (and GET authorize)
 * responses back to 302.
 */

type AuthFetchHandler = (request: Request) => Response | Promise<Response>;

/** True when the caller looks like a top-level document navigation. */
export function wantsBrowserNavigation(request: Request): boolean {
  const mode = request.headers.get("sec-fetch-mode")?.toLowerCase();
  if (mode === "navigate" || mode === "nested-navigate") return true;
  // Explicit fetch / XHR — keep JSON `{ redirect, url }` for Studio SPA.
  if (mode === "cors" || mode === "no-cors" || mode === "websocket") {
    return false;
  }

  const dest = request.headers.get("sec-fetch-dest")?.toLowerCase();
  if (dest === "document" || dest === "iframe" || dest === "frame") {
    return true;
  }

  const accept = request.headers.get("accept") ?? "";
  if (
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml")
  ) {
    return true;
  }

  return false;
}

/** GET/HEAD authorize is always a browser step in the OAuth code flow. */
export function isOauthAuthorizeGet(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  try {
    const path = new URL(request.url).pathname;
    return (
      path.endsWith("/oauth2/authorize") || path.includes("/oauth2/authorize/")
    );
  } catch {
    return false;
  }
}

function shouldForceHttpRedirect(request: Request): boolean {
  return isOauthAuthorizeGet(request) || wantsBrowserNavigation(request);
}

type RedirectBody = { redirect?: unknown; url?: unknown };

function parseRedirectBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as RedirectBody;
  if (o.redirect === true && typeof o.url === "string" && o.url.length > 0) {
    return o.url;
  }
  return null;
}

/**
 * Wrap a Fetch-style Better Auth handler so navigation clients receive 302.
 * Preserves Set-Cookie and other response headers from the JSON response.
 */
export function withOauthNavigationRedirect(
  handler: AuthFetchHandler,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const response = await handler(request);
    if (response.status !== 200) return response;
    if (!shouldForceHttpRedirect(request)) return response;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return response;

    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }

    const url = parseRedirectBody(body);
    if (!url) return response;

    const headers = new Headers(response.headers);
    headers.set("Location", url);
    headers.delete("content-type");
    headers.delete("Content-Type");
    headers.delete("content-length");
    headers.delete("Content-Length");

    return new Response(null, {
      status: 302,
      headers,
    });
  };
}
