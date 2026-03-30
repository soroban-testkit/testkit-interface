"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/app/utils/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-500",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-zinc-50 p-4 dark:bg-zinc-900">
          <Icon className="h-8 w-8 text-zinc-400 dark:text-zinc-600" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      <p className="mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="primary"
          onClick={onAction}
          className="mt-6"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
