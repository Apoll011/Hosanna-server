import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOauthAuthorizeGet,
  wantsBrowserNavigation,
  withOauthNavigationRedirect,
} from "../../src/lib/oauthNavigationRedirect.js";

const authorizeUrl =
  "https://dev-api.hosanna.live/api/auth/oauth2/authorize?response_type=code&client_id=x";

describe("wantsBrowserNavigation", () => {
  it("treats Sec-Fetch-Mode: navigate as navigation", () => {
    const req = new Request(authorizeUrl, {
      headers: { "sec-fetch-mode": "navigate", accept: "*/*" },
    });
    assert.equal(wantsBrowserNavigation(req), true);
  });

  it("treats Accept: text/html as navigation", () => {
    const req = new Request(authorizeUrl, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    assert.equal(wantsBrowserNavigation(req), true);
  });

  it("keeps Sec-Fetch-Mode: cors as fetch", () => {
    const req = new Request(authorizeUrl, {
      headers: {
        "sec-fetch-mode": "cors",
        accept: "application/json",
      },
    });
    assert.equal(wantsBrowserNavigation(req), false);
  });
});

describe("isOauthAuthorizeGet", () => {
  it("matches GET authorize", () => {
    assert.equal(
      isOauthAuthorizeGet(new Request(authorizeUrl, { method: "GET" })),
      true,
    );
  });

  it("ignores POST consent", () => {
    assert.equal(
      isOauthAuthorizeGet(
        new Request("https://x/api/auth/oauth2/consent", { method: "POST" }),
      ),
      false,
    );
  });
});

describe("withOauthNavigationRedirect", () => {
  const jsonRedirect = {
    redirect: true,
    url: "https://studio.hosanna.live/login?oauth=1",
  };

  it("converts JSON redirect to 302 for Chrome-like Accept", async () => {
    const inner = async () =>
      new Response(JSON.stringify(jsonRedirect), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "oauth_state=abc; Path=/; HttpOnly",
        },
      });

    const wrapped = withOauthNavigationRedirect(inner);
    const res = await wrapped(
      new Request(authorizeUrl, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        },
      }),
    );

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), jsonRedirect.url);
    assert.ok(res.headers.get("set-cookie")?.includes("oauth_state=abc"));
    assert.equal(await res.text(), "");
  });

  it("leaves JSON redirect for cors/json fetch", async () => {
    const inner = async () =>
      new Response(JSON.stringify(jsonRedirect), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const wrapped = withOauthNavigationRedirect(inner);
    const res = await wrapped(
      new Request("https://x/api/auth/oauth2/consent", {
        method: "POST",
        headers: {
          accept: "application/json",
          "sec-fetch-mode": "cors",
        },
      }),
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { redirect: boolean; url: string };
    assert.equal(body.redirect, true);
    assert.equal(body.url, jsonRedirect.url);
  });

  it("always converts GET authorize even without navigation hints", async () => {
    const inner = async () =>
      new Response(JSON.stringify(jsonRedirect), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const wrapped = withOauthNavigationRedirect(inner);
    const res = await wrapped(
      new Request(authorizeUrl, {
        headers: { accept: "*/*" },
      }),
    );

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), jsonRedirect.url);
  });
});
