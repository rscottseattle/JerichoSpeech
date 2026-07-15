"use client";

import { useEffect, useState } from "react";

type CaptionState = {
  translatedText: string;
  visible: boolean;
  sequence: number;
};

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

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/channels/${channel}/caption`, {
          cache: "no-store",
        });
        if (response.ok && active) {
          setCaption((await response.json()) as CaptionState);
        }
      } catch {
        // Keep the most recent caption on screen during a brief network interruption.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [channel]);

  const shown = caption.visible && Boolean(caption.translatedText.trim());

  return (
    <main className={`display-canvas ${preview ? "preview" : ""}`}>
      <div className={`caption-panel ${shown ? "" : "hidden"}`} aria-live="polite">
        <span className="caption-text">
          {caption.translatedText || "\u00a0"}
        </span>
      </div>
    </main>
  );
}
