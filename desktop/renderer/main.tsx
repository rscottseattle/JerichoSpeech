import React from "react";
import { createRoot } from "react-dom/client";
import { CaptionDisplay } from "../../app/components/CaptionDisplay";
import { OperatorConsole } from "../../app/components/OperatorConsole";
import "../../app/globals.css";

function DesktopRoute() {
  const match = window.location.pathname.match(/^\/display\/([a-z0-9-]+)$/);
  if (match) {
    return (
      <CaptionDisplay
        channel={match[1]}
        preview={new URLSearchParams(window.location.search).has("preview")}
      />
    );
  }

  return <OperatorConsole />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopRoute />
  </React.StrictMode>,
);
