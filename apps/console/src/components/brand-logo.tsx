import Image from "next/image";
import { cn } from "@/lib/utils";

const WORDMARK = {
  dark: "/brand/complifine.png",
  light: "/brand/complifine-on-light.png",
} as const;

/** Wordmark PNGs: dark surfaces vs light surfaces. */
export function BrandLogo({
  className,
  collapsed = false,
  priority = true,
  tone = "dark",
}: {
  className?: string;
  collapsed?: boolean;
  priority?: boolean;
  tone?: "dark" | "light";
}) {
  if (collapsed) {
    return (
      <Image
        src="/android-chrome-192x192.png"
        alt="CompliFine"
        width={32}
        height={32}
        className={cn("size-8 shrink-0 rounded-md", className)}
        priority={priority}
      />
    );
  }

  return (
    <Image
      src={WORDMARK[tone]}
      alt="CompliFine"
      width={1620}
      height={400}
      className={cn("h-9 w-auto object-contain object-left", className)}
      priority={priority}
    />
  );
}
