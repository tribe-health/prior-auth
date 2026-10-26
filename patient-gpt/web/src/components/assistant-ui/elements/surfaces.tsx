"use client";

import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsomorphicLayoutEffect } from "../utils/useIsomorphicLayoutEffect";

export const paper = "pg-ui bg-(--s1) text-foreground";

export const floating = "pg-ui bg-(--inv) text-(--inv-fg)";

export const field =
  "pg-ui bg-(--s2) text-foreground";

export const fieldInteractive =
  "pg-ui bg-(--s2) text-foreground transition-colors duration-(--dur-enter) ease-(--ease) hover:bg-(--s3) focus-visible:bg-(--focus-bg) focus-visible:text-(--focus-fg) motion-reduce:transition-none";

export const pressable =
  "transition-transform duration-(--dur-enter) ease-(--ease) motion-reduce:transition-none";

export const ghostButton =
  "pg-ui flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-colors duration-(--dur-enter) ease-(--ease) hover:bg-(--s3) hover:text-foreground focus-visible:bg-(--focus-bg) focus-visible:text-(--focus-fg) motion-reduce:transition-none";

export const inkButton =
  "pg-ui bg-primary text-primary-foreground transition-colors duration-(--dur-enter) ease-(--ease) hover:bg-(--primary-hover) focus-visible:bg-(--focus-bg) focus-visible:text-(--focus-fg) motion-reduce:transition-none";

export const iconSwap =
  "[grid-area:1/1] transition-[opacity,scale,filter] duration-(--dur-enter) ease-(--ease) motion-reduce:transition-none";

export const iconSwapIn = "scale-100 opacity-100 blur-none";

export const iconSwapOut = "scale-[0.25] opacity-0 blur-[4px]";

export const labelSwap =
  "col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-(--dur-enter) ease-(--ease) motion-reduce:transition-none";

export const labelSwapIn = "opacity-100 blur-none";

export const labelSwapOut =
  "pointer-events-none select-none opacity-0 blur-[2px]";

export const collapsePanel =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--dur-enter) ease-(--ease) data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none";

export const live = "text-(--cool)";

export const mono = "font-mono text-[11px] tracking-tight";

export function ShimmerLabel({
  active = true,
  className,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      className={cn("aui-shimmer-label", active && "shimmer motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/**
 * Scroll region for content that keeps its own whitespace. `whitespace-pre` in
 * a bounded box clips a long line with no way to reach it, so the rows scroll
 * instead.
 *
 * `codeSurface` wraps all the rows as one block, and the rows are its children.
 * It cannot go on each row: `min-width: 100%` resolves against the scroll
 * container's visible width rather than its scroll width, so a per-row width
 * leaves every row except the longest ending its background at the fold.
 */
export const codeScroll = "overflow-x-auto";

export const codeSurface = "w-max min-w-full";

export function SwapLabel({
  active,
  children,
  className,
}: {
  active: 0 | 1;
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}) {
  const layers = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const [width, setWidth] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const target = layers[active]?.current;
    if (!target) return undefined;
    const measure = () =>
      setWidth(Math.ceil(target.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  return (
    <span
      style={width === null ? undefined : { width }}
      className={cn(
        "grid overflow-x-clip transition-[width] duration-(--dur-enter) ease-(--ease) motion-reduce:transition-none",
        className,
      )}
    >
      {children.map((layer, index) => (
        <span
          key={index}
          ref={layers[index]}
          aria-hidden={active !== index}
          className={cn(
            labelSwap,
            active === index ? labelSwapIn : labelSwapOut,
          )}
        >
          {layer}
        </span>
      ))}
    </span>
  );
}
