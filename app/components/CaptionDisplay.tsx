"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CaptionComposer,
  type CaptionLine,
} from "../lib/caption-composer";

type CaptionState = {
  translatedText: string;
  visible: boolean;
  sequence: number;
  status: string;
};

const SCROLL_DURATION_MS = 680;
const SCROLL_HOLD_MS = 120;
const PHRASE_BUFFER_MS = 240;
const PHRASE_END_BUFFER_MS = 90;

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
    status: "idle",
  });
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const composerRef = useRef(new CaptionComposer());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phraseTimerRef = useRef<number | null>(null);
  const flushComposerRef = useRef<() => void>(() => {});
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
      viewport.scrollTop = start + distance * easeInOutCubic(progress);

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

  const flushComposer = useCallback(() => {
    phraseTimerRef.current = null;
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement("canvas");
    }
    const context = measureCanvasRef.current.getContext("2d");
    const computed = window.getComputedStyle(viewport);
    if (context) {
      context.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    }

    const result = composerRef.current.flush({
      maxWidth: viewport.clientWidth,
      measureText: (value) => context?.measureText(value).width ?? value.length * 24,
    });
    setLines(result.lines);

    if (result.hasPending) {
      const delay = result.lineAdded
        ? SCROLL_DURATION_MS + SCROLL_HOLD_MS
        : PHRASE_END_BUFFER_MS;
      phraseTimerRef.current = window.setTimeout(
        () => flushComposerRef.current(),
        delay,
      );
    }
  }, []);

  useLayoutEffect(() => {
    flushComposerRef.current = flushComposer;
  }, [flushComposer]);

  const scheduleComposerFlush = useCallback((phraseEnded: boolean) => {
    const delay = phraseEnded ? PHRASE_END_BUFFER_MS : PHRASE_BUFFER_MS;
    if (phraseTimerRef.current !== null) {
      if (!phraseEnded) return;
      window.clearTimeout(phraseTimerRef.current);
    }
    phraseTimerRef.current = window.setTimeout(
      () => flushComposerRef.current(),
      delay,
    );
  }, []);

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
              current.visible === next.visible &&
              current.status === next.status
              ? current
              : next;
          });
        }
      } catch {
        // Network silence preserves the last readable frame.
      } finally {
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
    const next = caption.translatedText.replace(/\s+/g, " ").trim();

    if (!next) {
      if (caption.status !== "clear" && caption.status !== "idle") return;
      if (phraseTimerRef.current !== null) {
        window.clearTimeout(phraseTimerRef.current);
        phraseTimerRef.current = null;
      }
      composerRef.current.clear();
      positionedRef.current = false;
      latestScrollTargetRef.current = 0;
      setLines([]);
      return;
    }

    const update = composerRef.current.ingest(next);
    if (update.added) scheduleComposerFlush(update.phraseEnded);
  }, [caption.sequence, caption.status, caption.translatedText, scheduleComposerFlush]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (!lines.length) {
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
  }, [cancelScrolling, lines, scrollOneLine]);

  useEffect(
    () => () => {
      if (phraseTimerRef.current !== null) {
        window.clearTimeout(phraseTimerRef.current);
      }
      cancelScrolling();
    },
    [cancelScrolling],
  );

  const shown = caption.visible && lines.length > 0;
  const activeIndex = lines.length - 1;

  return (
    <main className={`display-canvas ${preview ? "preview" : ""}`}>
      <div className={`caption-panel ${shown ? "" : "hidden"}`} aria-live="polite">
        <div className="caption-viewport" ref={viewportRef}>
          <div className="caption-track">
            {lines.map((line, index) => {
              const focus =
                index === activeIndex
                  ? "active"
                  : index === activeIndex - 1
                    ? "recent"
                    : "history";
              return (
                <div
                  className={`caption-line ${focus}`}
                  data-committed={line.committed}
                  key={line.id}
                >
                  {line.runs.map((run) => (
                    <span className="caption-run" key={run.id}>
                      {run.text}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
