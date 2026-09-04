"use client";

export function CubeFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      title={title}
      src={src}
      className="h-[calc(100svh-3.5rem)] w-full flex-1 border-0 bg-background"
    />
  );
}
