import Image from "next/image";

import { cn } from "@/lib/cn";
import { managerOverrides } from "@/config/managers";
import type { Manager } from "@/lib/types";

interface ManagerAvatarProps {
  manager: Manager;
  size?: number;
  className?: string;
  ring?: "none" | "subtle" | "gradient" | "accent";
  priority?: boolean;
}

export function ManagerAvatar({
  manager,
  size = 48,
  className,
  ring = "none",
  priority = false,
}: ManagerAvatarProps) {
  const accent = managerOverrides[manager.userId]?.accentColor;

  if (ring === "gradient") {
    return (
      <span
        className={cn("avatar-ring inline-flex align-middle", className)}
        style={{ width: size, height: size }}
      >
        <span
          className="block h-full w-full overflow-hidden rounded-full bg-background"
          style={{ width: size - 4, height: size - 4 }}
        >
          <Image
            src={manager.avatarUrl}
            alt={manager.displayName}
            width={size - 4}
            height={size - 4}
            sizes={`${size - 4}px`}
            className="h-full w-full object-cover"
            priority={priority}
          />
        </span>
      </span>
    );
  }

  const ringStyle: React.CSSProperties | undefined =
    ring === "accent" && accent
      ? { boxShadow: `0 0 0 2px ${accent}` }
      : ring === "subtle"
        ? { boxShadow: `0 0 0 1px var(--border-strong)` }
        : undefined;

  return (
    <span
      className={cn(
        "inline-block overflow-hidden rounded-full bg-foreground/5 align-middle shrink-0",
        className,
      )}
      style={{ width: size, height: size, ...ringStyle }}
    >
      <Image
        src={manager.avatarUrl}
        alt={manager.displayName}
        width={size}
        height={size}
        sizes={`${size}px`}
        className="h-full w-full object-cover"
        priority={priority}
      />
    </span>
  );
}
