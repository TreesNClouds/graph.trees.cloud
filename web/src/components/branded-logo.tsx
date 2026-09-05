"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import BlackLogo from "../../public/logos/logo.trees.cloud.png";
import WhiteLogo from "../../public/logos/logo.trees.cloud.white.png";
import { cn } from "@/lib/utils";

type BrandedLogoProps = {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  href?: string;
};

const sizes = {
  xs: "h-6 w-auto",
  sm: "h-8 w-auto",
  md: "h-[2.1rem] w-auto",
  lg: "h-16 w-auto",
};

export function BrandedLogo({ className = "", size = "sm", href = "/" }: BrandedLogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && (resolvedTheme === "dark" || (!resolvedTheme && theme === "dark"));
  const src = isDark ? WhiteLogo : BlackLogo;

  if (!mounted) {
    return (
      <Link href={href} className={cn("block", className)}>
        <div className={cn(sizes[size], "animate-pulse rounded-md bg-muted")} />
      </Link>
    );
  }

  return (
    <Link href={href} className={cn("block", className)}>
      <Image
        src={src}
        alt="Trees.Cloud"
        width={1200}
        height={150}
        sizes="384px"
        quality={100}
        className={cn(sizes[size], "cursor-pointer transition-opacity hover:opacity-80")}
        priority
      />
    </Link>
  );
}
