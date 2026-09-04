export class GqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GqlError";
  }
}

export async function gql<T>(
  key: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("/api/v2/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  let body: { data?: T; errors?: Array<{ message?: string }> } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new GqlError("GraphQL did not return JSON.");
  }
  if (body.errors?.[0]?.message) throw new GqlError(body.errors[0].message);
  if (!res.ok) throw new GqlError(`GraphQL returned ${res.status}.`);
  if (!body.data) throw new GqlError("GraphQL returned no data.");
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
