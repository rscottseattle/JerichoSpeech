"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type CaptionState = {
  translatedText: string;
  visible: boolean;
  sequence: number;
};

const SCROLL_DURATION_MS = 520;
const MIN_SLIDING_OVERLAP = 16;

function cleanCaptionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendedCaptionText(previous: string, next: string) {
  if (!previous) return next;
  if (next === previous || previous.endsWith(next)) return "";
  if (next.startsWith(previous)) return next.slice(previous.length);

  const maximumOverlap = Math.min(previous.length, next.length);
  for (
    let length = maximumOverlap;
    length >= MIN_SLIDING_OVERLAP;
    length -= 1
  ) {
    if (previous.endsWith(next.slice(0, length))) {
      return next.slice(length);
    }
  }

  // Manual captions and fresh translation segments begin on a stable new row.
  return `\n${next}`;
}

export function CaptionDisplay({
  channel,
  preview,
}: {
  channel: string;
  preview: boolean;
}) {
  const [caption, setCaption] = useState<CaptionState>({
    translatedText: "",
    visible: true,
    sequence: 0,
  });
  const [rollingText, setRollingText] = useState("");
  const previousCaptionRef = useRef("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const lastScrollTargetRef = useRef(0);
  const positionedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/channels/${channel}/caption`, {
          cache: "no-store",
        });
        if (response.ok && active) {
          const next = (await response.json()) as CaptionState;
          setCaption((current) =>
            current.sequence === next.sequence &&
            current.translatedText === next.translatedText &&
            current.visible === next.visible
              ? current
              : next,
          );
        }
      } catch {
        // Keep the most recent caption on screen during a brief network interruption.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 75);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [channel]);

  useEffect(() => {
    const next = cleanCaptionText(caption.translatedText);

    if (!next) {
      previousCaptionRef.current = "";
      positionedRef.current = false;
      lastScrollTargetRef.current = 0;
      setRollingText("");
      return;
    }

    const addition = appendedCaptionText(previousCaptionRef.current, next);
    previousCaptionRef.current = next;
    if (addition) setRollingText((current) => `${current}${addition}`);
  }, [caption.sequence, caption.translatedText]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (!rollingText) {
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      viewport.scrollTop = 0;
      return;
    }

    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (!positionedRef.current) {
      viewport.scrollTop = target;
      lastScrollTargetRef.current = target;
      positionedRef.current = true;
      return;
    }

    if (target <= lastScrollTargetRef.current + 0.5) return;
    lastScrollTargetRef.current = target;

    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewport.scrollTop = target;
      scrollFrameRef.current = null;
      return;
    }

    const start = viewport.scrollTop;
    const distance = target - start;
    const startedAt = performance.now();

    const advance = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / SCROLL_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      viewport.scrollTop = start + distance * eased;

      if (progress < 1) {
        scrollFrameRef.current = window.requestAnimationFrame(advance);
      } else {
        scrollFrameRef.current = null;
      }
    };

    scrollFrameRef.current = window.requestAnimationFrame(advance);
  }, [rollingText]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const shown = caption.visible && Boolean(rollingText.trim());

  return (
    <main className={`display-canvas ${preview ? "preview" : ""}`}>
      <div className={`caption-panel ${shown ? "" : "hidden"}`} aria-live="polite">
        <div className="caption-viewport" ref={viewportRef}>
          <div className="caption-track">
            <span className="caption-text">{rollingText || "\u00a0"}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
