"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObjectExplorer } from "@/components/object-explorer";
import { useApiKey } from "@/lib/use-api-key";
import { getObject, type ObjectSpec } from "@/lib/objects";

export default function ObjectPage() {
  const params = useParams<{ slug: string }>();
  const spec = getObject(String(params.slug ?? ""));

  return (
    <AppShell>
      {!spec ? (
        <div className="px-6 py-16 text-sm text-muted-foreground">Unknown object.</div>
      ) : (
        <ObjectBody spec={spec} />
      )}
    </AppShell>
  );
}

function ObjectBody({ spec }: { spec: ObjectSpec }) {
  const { key } = useApiKey();
  if (!key) return null;
  return <ObjectExplorer spec={spec} apiKey={key} />;
}
