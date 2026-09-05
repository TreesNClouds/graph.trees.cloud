import { toastError } from "@/lib/toast";

export class GqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GqlError";
  }
}

function fail(message: string): never {
  toastError(message);
  throw new GqlError(message);
}

export async function gql<T>(
  key: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/v2/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    fail("Could not reach GraphQL. Is the API running?");
  }
  const raw = await res.text();
  let body: { data?: T; errors?: Array<{ message?: string }> } = {};
  try {
    body = raw ? (JSON.parse(raw) as typeof body) : {};
  } catch {
    fail(
      res.ok
        ? "GraphQL did not return JSON."
        : `GraphQL is unreachable (${res.status}). Start the API and try again.`,
    );
  }
  if (body.errors?.[0]?.message) fail(body.errors[0].message);
  if (!res.ok) fail(`GraphQL returned ${res.status}.`);
  if (!body.data) fail("GraphQL returned no data.");
  return body.data;
}

export type CubePage = {
  snapshotDate?: string | null;
  total?: number | null;
  page?: number | null;
  perPage?: number | null;
  data?: Array<Record<string, unknown>> | null;
  columns?: Array<Record<string, unknown>> | null;
};

export type CubeResult = {
  snapshotDate?: string | null;
  count?: number | null;
  data?: Array<Record<string, unknown>> | null;
};

export type TenantSchema = {
  label?: string;
  dims?: string[];
  metrics?: string[];
  default_metrics?: string[];
  filters?: Array<{ q: string; kind: string; type: string; multi?: boolean; label?: string }>;
  columns?: Array<{ col: string; label?: string; kind?: string }>;
};
