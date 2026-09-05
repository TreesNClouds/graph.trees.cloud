"use client";

import { useCallback } from "react";

/** Cube HTML ships its own app bar. This shell already has one — hide the inner chrome. */
const EMBED_CSS = `
.appbar,.subbar,.crumbs,.navwrap{display:none!important}
`;

function stripInnerChrome(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc?.head) return;
  let style = doc.getElementById("tnc-embed-chrome") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "tnc-embed-chrome";
    doc.head.appendChild(style);
  }
  style.textContent = EMBED_CSS;
}

export function CubeFrame({ src, title }: { src: string; title: string }) {
  const onLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    stripInnerChrome(e.currentTarget);
  }, []);

  return (
    <iframe
      title={title}
      src={src}
      onLoad={onLoad}
      className="h-[calc(100svh-3.5rem)] w-full flex-1 border-0 bg-background"
    />
  );
}
