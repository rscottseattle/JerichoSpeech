"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type CaptionState = {
  translatedText: string;
  visible: boolean;
  sequence: number;
};

const SCROLL_DURATION_MS = 680;
const SCROLL_HOLD_MS = 120;
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

  // A missed polling window must not create an artificial visual line break.
  // The browser's measured width is the only thing allowed to finish a row.
  return ` ${next}`;
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
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
  const scrollHoldRef = useRef<number | null>(null);
  const scrollOneLineRef = useRef<() => void>(() => {});
  const latestScrollTargetRef = useRef(0);
  const scrollingRef = useRef(false);
  const positionedRef = useRef(false);

  const cancelScrolling = useCallback(() => {
    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    if (scrollHoldRef.current) {
      window.clearTimeout(scrollHoldRef.current);
      scrollHoldRef.current = null;
    }
    scrollingRef.current = false;
  }, []);

  const scrollOneLine = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || scrollingRef.current) return;

    const remaining = latestScrollTargetRef.current - viewport.scrollTop;
    if (remaining <= 0.5) {
      viewport.scrollTop = latestScrollTargetRef.current;
      return;
    }

    const computedLineHeight = Number.parseFloat(
      window.getComputedStyle(viewport).lineHeight,
    );
    const lineHeight = Number.isFinite(computedLineHeight)
      ? computedLineHeight
      : viewport.clientHeight / 3;
    const distance = Math.min(lineHeight, remaining);
    scrollingRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewport.scrollTop += distance;
      if (latestScrollTargetRef.current - viewport.scrollTop > 0.5) {
        scrollHoldRef.current = window.setTimeout(() => {
          scrollHoldRef.current = null;
          scrollingRef.current = false;
          scrollOneLineRef.current();
        }, SCROLL_HOLD_MS);
      } else {
        scrollingRef.current = false;
      }
      return;
    }

    const start = viewport.scrollTop;
    const destination = start + distance;
    const startedAt = performance.now();

    const advance = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / SCROLL_DURATION_MS);
      viewport.scrollTop =
        start + distance * easeInOutCubic(progress);

      if (progress < 1) {
        scrollFrameRef.current = window.requestAnimationFrame(advance);
        return;
      }

      viewport.scrollTop = destination;
      scrollFrameRef.current = null;

      if (latestScrollTargetRef.current - destination > 0.5) {
        scrollHoldRef.current = window.setTimeout(() => {
          scrollHoldRef.current = null;
          scrollingRef.current = false;
          scrollOneLineRef.current();
        }, SCROLL_HOLD_MS);
      } else {
        scrollingRef.current = false;
      }
    };

    scrollFrameRef.current = window.requestAnimationFrame(advance);
  }, []);

  useLayoutEffect(() => {
    scrollOneLineRef.current = scrollOneLine;
  }, [scrollOneLine]);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/channels/${channel}/caption`, {
          cache: "no-store",
        });
        if (response.ok && active) {
          const next = (await response.json()) as CaptionState;
          setCaption((current) => {
            if (next.sequence < current.sequence) return current;
            return current.sequence === next.sequence &&
              current.translatedText === next.translatedText &&
              current.visible === next.visible
              ? current
              : next;
          });
        }
      } catch {
        // Keep the most recent caption on screen during a brief network interruption.
      } finally {
        // Wait for this request to finish before polling again so responses
        // cannot arrive out of order and masquerade as a new caption segment.
        if (active) timer = window.setTimeout(refresh, 75);
      }
    };

    void refresh();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [channel]);

  useEffect(() => {
    const next = cleanCaptionText(caption.translatedText);

    if (!next) {
      previousCaptionRef.current = "";
      positionedRef.current = false;
      latestScrollTargetRef.current = 0;
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
      cancelScrolling();
      viewport.scrollTop = 0;
      return;
    }

    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (!positionedRef.current) {
      viewport.scrollTop = target;
      latestScrollTargetRef.current = target;
      positionedRef.current = true;
      return;
    }

    if (target < latestScrollTargetRef.current - 0.5) {
      cancelScrolling();
      viewport.scrollTop = target;
      latestScrollTargetRef.current = target;
      return;
    }

    if (target <= latestScrollTargetRef.current + 0.5) return;
    latestScrollTargetRef.current = target;
    scrollOneLine();
  }, [cancelScrolling, rollingText, scrollOneLine]);

  useEffect(
    () => () => {
      cancelScrolling();
    },
    [cancelScrolling],
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
