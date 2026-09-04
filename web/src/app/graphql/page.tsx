import { AppShell } from "@/components/app-shell";
import { CubeFrame } from "@/components/cube-frame";

export default function GraphqlPage() {
  return (
    <AppShell>
      <CubeFrame src="/api/v2/graphql" title="GraphiQL" />
    </AppShell>
  );
}
