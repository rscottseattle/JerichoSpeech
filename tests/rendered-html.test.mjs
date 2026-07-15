import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build contains the JerichoSpeech overhead-caption workflow", async () => {
  const [layout, operator, display, captionApi, realtimeApi, styles] =
    await Promise.all([
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/OperatorConsole.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/CaptionDisplay.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/channels/[channel]/caption/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/realtime/session/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(layout, /title:\s*"JerichoSpeech"/);
  assert.match(operator, /Start live translation/);
  assert.match(operator, /Rehearsal mode/);
  assert.match(operator, /\/display\/main/);
  assert.match(display, /setInterval\(refresh, 250\)/);
  assert.match(captionApi, /liveChannels/);
  assert.match(realtimeApi, /gpt-realtime-translate/);
  assert.match(styles, /body:has\(\.display-canvas\)/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /\.caption-panel\s*\{[^}]*height:\s*4\.9em/s);
  assert.match(styles, /\.caption-text\s*\{[^}]*-webkit-line-clamp:\s*3/s);

  await access(new URL("../dist/server/index.js", import.meta.url));
});
