// api/reddit-mcp.ts

type RedditBridgeRequest = {
  subreddit: string;
  query: string;
  size?: number;
  before?: number;
  after?: number;
};

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return json(
        { error: "Method not allowed. Use POST." },
        405
      );
    }

    // Optional wrapper auth for your agent
    const wrapperKey = process.env.MCP_WRAPPER_KEY;
    if (wrapperKey) {
      const header = request.headers.get("x-mcp-key");
      if (!header || header !== wrapperKey) {
        return json({ error: "Unauthorised." }, 401);
      }
    }

    const bridgeUrl = process.env.REDDIT_BRIDGE_URL;
    if (!bridgeUrl) {
      return json(
        { error: "Server misconfigured: REDDIT_BRIDGE_URL not set." },
        500
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json(
        { error: "Request body must be valid JSON." },
        400
      );
    }

    if (typeof body.subreddit !== "string" || typeof body.query !== "string") {
      return json(
        {
          error:
            "Body must include string fields 'subreddit' and 'query'."
        },
        400
      );
    }

    const payload: RedditBridgeRequest = {
      subreddit: body.subreddit,
      query: body.query,
      size: body.size,
      before: body.before,
      after: body.after
    };

    const bypassSecret = process.env.REDDIT_BRIDGE_BYPASS_SECRET;

    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    if (bypassSecret) {
      headers["x-vercel-protection-bypass"] = bypassSecret;
    }

    const upstream = await fetch(bridgeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!upstream.ok) {
      return json(
        {
          error: "Upstream bridge error.",
          status: upstream.status,
          detail: data
        },
        502
      );
    }

    return json(
      {
        ok: true,
        bridge_status: upstream.status,
        bridge_url: bridgeUrl,
        data
      },
      200
    );
  } catch (err: any) {
    return json(
      {
        error: "Unexpected server error.",
        detail:
          typeof err?.message === "string"
            ? err.message
            : "Unknown error"
      },
      500
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });
}
