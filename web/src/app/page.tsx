import { AppShell } from "@/components/app-shell";
import { CubeFrame } from "@/components/cube-frame";

export default function HomePage() {
  return (
    <AppShell>
      <CubeFrame src="/api/v2/cube" title="Trees N Clouds catalog" />
    </AppShell>
  );
}
