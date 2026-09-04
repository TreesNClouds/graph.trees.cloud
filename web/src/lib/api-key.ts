export const TOK_KEY = "tc-tok";
export const GRAPHIQL_HEADERS_KEY = "graphiql:headers";

export function graphiqlHeaders(key: string): string {
  return `{\n  "Authorization": "Bearer ${key}"\n}`;
}

export function readStoredKey(): string {
  try {
    return sessionStorage.getItem(TOK_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function persistKey(key: string): void {
  try {
    sessionStorage.setItem(TOK_KEY, key);
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(GRAPHIQL_HEADERS_KEY, graphiqlHeaders(key));
  } catch {
    /* private mode */
  }
}

export function clearKey(): void {
  try {
    sessionStorage.removeItem(TOK_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(GRAPHIQL_HEADERS_KEY);
  } catch {
    /* ignore */
  }
}

type ProbeResult =
  | { ok: true }
  | { ok: false; message: string };

export async function probeKey(key: string): Promise<ProbeResult> {
  const res = await fetch("/api/v2/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: "query { publicMenus { __typename } }" }),
  });
  let body: { errors?: Array<{ message?: string; extensions?: { code?: string } }> } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: "GraphQL upstream did not return JSON." };
  }
  const err = body.errors?.[0];
  const code = err?.extensions?.code;
  if (code === "UNAUTHENTICATED" || res.status === 401) {
    return { ok: false, message: "Invalid or inactive key." };
  }
  if (err) {
    return { ok: false, message: err.message || "Auth failed." };
  }
  if (!res.ok) {
    return { ok: false, message: `Upstream returned ${res.status}.` };
  }
  return { ok: true };
}
