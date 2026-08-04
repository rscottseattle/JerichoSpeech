import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build contains the JerichoSpeech overhead-caption workflow", async () => {
  const [layout, operator, display, captionApi, realtimeApi, settingsApi, presenterSettingsApi, desktop, presenter, entitlements, styles] =
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
      readFile(
        new URL("../app/api/settings/openai-key/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/settings/propresenter/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8"),
      readFile(new URL("../desktop/propresenter.cjs", import.meta.url), "utf8"),
      readFile(
        new URL("../desktop/entitlements.mac.plist", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(layout, /title:\s*"JerichoSpeech"/);
  assert.match(operator, /Start live translation/);
  assert.match(operator, /Rehearsal mode/);
  assert.match(operator, /\/display\/main/);
  assert.match(display, /setTimeout\(refresh, 75\)/);
  assert.match(display, /next\.sequence < current\.sequence/);
  assert.match(operator, /CAPTION_PUBLISH_INTERVAL_MS = 50/);
  assert.match(operator, /PARTIAL_WORD_FLUSH_MS = 250/);
  assert.match(captionApi, /liveChannels/);
  assert.match(realtimeApi, /gpt-realtime-translate/);
  assert.match(settingsApi, /configured/);
  assert.match(presenterSettingsApi, /supported: false/);
  assert.match(desktop, /safeStorage\s*\.\s*encryptString/);
  assert.match(desktop, /systemPreferences\.askForMediaAccess\("microphone"\)/);
  assert.match(desktop, /\/api\/permissions\/microphone/);
  assert.match(operator, /Open Mac Microphone Settings/);
  assert.match(entitlements, /com\.apple\.security\.device\.audio-input/);
  assert.match(desktop, /127\.0\.0\.1/);
  assert.match(desktop, /\/display\/main/);
  assert.match(desktop, /scheduleProPresenterCaption/);
  assert.match(presenter, /\/v1\/message\/\$\{message\}\/trigger/);
  assert.match(operator, /ProPresenter direct/);
  assert.match(styles, /body:has\(\.display-canvas\)/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /\.caption-panel\s*\{[^}]*height:\s*4\.9em/s);
  assert.match(styles, /\.caption-viewport\s*\{[^}]*height:\s*3\.48em/s);
  assert.match(styles, /\.caption-panel\s*\{[^}]*text-align:\s*left/s);
  assert.match(styles, /font-size:\s*clamp\(22px, 2\.6vw, 50px\)/);
  assert.match(display, /appendedCaptionText/);
  assert.match(display, /return ` \$\{next\}`/);
  assert.match(display, /SCROLL_DURATION_MS = 680/);
  assert.match(display, /scrollOneLine/);

  await access(new URL("../dist/server/index.js", import.meta.url));
});
