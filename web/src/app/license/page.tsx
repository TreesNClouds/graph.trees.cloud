import { readFileSync } from "node:fs";
import path from "node:path";
import { ExplorerHeader } from "@/components/explorer-header";

function licenseText(): string {
  const candidates = [
    path.join(process.cwd(), "LICENSE"),
    path.join(process.cwd(), "..", "LICENSE"),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      /* try the next path */
    }
  }
  return "License file not found.";
}

export default function LicensePage() {
  const text = licenseText();

  return (
    <div className="flex min-h-svh flex-col">
      <ExplorerHeader />
      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight">License</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Functional Source License 1.1 — MIT after two years. You can read,
          fork, and self-host. Offering a competing hosted substitute is not a
          permitted purpose.
        </p>
        <pre className="mt-8 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
          {text}
        </pre>
      </article>
    </div>
  );
}
