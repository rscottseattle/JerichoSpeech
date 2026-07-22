"use client";

import { useEffect, useRef, useState } from "react";

type RunState = "idle" | "connecting" | "live";
type PresenterConnectionState = "idle" | "testing" | "connected";

type PresenterSettings = {
  supported: boolean;
  enabled: boolean;
  host: string;
  port: number;
  messageId: string;
  tokenName: string;
};

type PresenterMessage = {
  uuid: string;
  name: string;
  index: number;
  textTokens: string[];
};

const rehearsalLines = [
  "Bienvenidos. Nos alegra mucho que estén aquí con nosotros esta mañana.",
  "Hoy vamos a hablar de la esperanza que encontramos en Jesús.",
  "Si esta es su primera vez, queremos que se sientan como en casa.",
];

const CAPTION_PUBLISH_INTERVAL_MS = 50;
const PARTIAL_WORD_FLUSH_MS = 250;

function captionWindow(value: string, includePartialWord = false) {
  let clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const endsAtWordBoundary = /[\s.,!?;:…\-–—)\]}"'»]$/u.test(value);
  if (!includePartialWord && !endsAtWordBoundary) {
    const lastSpace = clean.lastIndexOf(" ");
    clean = lastSpace >= 0 ? clean.slice(0, lastSpace).trim() : "";
  }

  if (!clean) return "";
  const words = clean.split(" ");
  return words.slice(-24).join(" ");
}

function tail(value: string, length = 190) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `…${clean.slice(-length)}` : clean;
}

export function OperatorConsole() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [level, setLevel] = useState(0);
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [manualText, setManualText] = useState(rehearsalLines[0]);
  const [visible, setVisible] = useState(true);
  const [monitorAudio, setMonitorAudio] = useState(false);
  const [error, setError] = useState("");
  const [demoRunning, setDemoRunning] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [presenterSettings, setPresenterSettings] =
    useState<PresenterSettings | null>(null);
  const [presenterMessages, setPresenterMessages] = useState<PresenterMessage[]>([]);
  const [presenterConnection, setPresenterConnection] =
    useState<PresenterConnectionState>("idle");
  const [presenterVersion, setPresenterVersion] = useState("");
  const [presenterSaving, setPresenterSaving] = useState(false);
  const [presenterError, setPresenterError] = useState("");

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const partialFlushTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const sourceRef = useRef("");
  const translationRef = useRef("");
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings/openai-key", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { configured?: boolean };
        if (active) setApiKeyConfigured(Boolean(payload.configured));
      })
      .catch(() => {
        if (active) setApiKeyConfigured(false);
      });

    void fetch("/api/settings/propresenter", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as PresenterSettings;
        if (!active || !payload.supported) return;
        setPresenterSettings(payload);
        if (payload.enabled) void testProPresenterConnection(payload);
      })
      .catch(() => {
        // Direct ProPresenter output is available only in the installed Mac app.
      });

    return () => {
      active = false;
      stopEverything(false);
    };
    // Cleanup should run only when the console unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publishCaption(overrides?: {
    sourceText?: string;
    translatedText?: string;
    visible?: boolean;
    status?: string;
  }) {
    const response = await fetch("/api/channels/main/caption", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceText: overrides?.sourceText ?? sourceRef.current,
        translatedText:
          overrides?.translatedText ?? captionWindow(translationRef.current),
        visible: overrides?.visible ?? visible,
        status: overrides?.status ?? runState,
      }),
    });

    if (!response.ok) {
      throw new Error("The overhead display could not be updated.");
    }
  }

  function schedulePublish() {
    if (publishTimerRef.current) return;
    publishTimerRef.current = window.setTimeout(async () => {
      publishTimerRef.current = null;
      try {
        await publishCaption({ status: "live" });
      } catch (publishError) {
        setError(
          publishError instanceof Error
            ? publishError.message
            : "The overhead display could not be updated.",
        );
      }
    }, CAPTION_PUBLISH_INTERVAL_MS);
  }

  function schedulePartialWordFlush() {
    if (partialFlushTimerRef.current) {
      window.clearTimeout(partialFlushTimerRef.current);
    }

    partialFlushTimerRef.current = window.setTimeout(async () => {
      partialFlushTimerRef.current = null;
      const completeCaption = captionWindow(translationRef.current, true);
      setTranslatedText(completeCaption);
      try {
        await publishCaption({
          translatedText: completeCaption,
          status: "live",
        });
      } catch (publishError) {
        setError(
          publishError instanceof Error
            ? publishError.message
            : "The overhead display could not be updated.",
        );
      }
    }, PARTIAL_WORD_FLUSH_MS);
  }

  function scheduleAutoClear() {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(async () => {
      translationRef.current = "";
      setTranslatedText("");
      try {
        await publishCaption({ translatedText: "" });
      } catch {
        // A later transcript update will retry the display connection.
      }
    }, 8000);
  }

  function beginMeter(stream: MediaStream) {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    audioContextRef.current = audioContext;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, item) => sum + item, 0) / data.length;
      setLevel(Math.min(100, Math.round(average * 1.7)));
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function loadDevices() {
    setError("");
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const available = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput",
      );
      permissionStream.getTracks().forEach((track) => track.stop());
      setDevices(available);
      if (!deviceId && available[0]) setDeviceId(available[0].deviceId);
    } catch {
      setError("Microphone permission was not granted. Check the browser settings.");
    }
  }

  async function startLiveTranslation() {
    setError("");
    setRunState("connecting");
    sourceRef.current = "";
    translationRef.current = "";
    setSourceText("");
    setTranslatedText("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      beginMeter(stream);

      const secretResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });
      const secretPayload = (await secretResponse.json()) as {
        value?: string;
        error?: string;
      };
      if (!secretResponse.ok || !secretPayload.value) {
        throw new Error(secretPayload.error || "Live translation could not start.");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setRunState("live");
          void publishCaption({ status: "live" });
        }
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
          setError("The live translation connection ended.");
          setRunState("idle");
        }
      };

      const events = peer.createDataChannel("oai-events");
      events.onmessage = (message) => {
        const event = JSON.parse(message.data) as {
          type?: string;
          delta?: string;
          error?: { message?: string };
        };

        if (event.type === "session.output_transcript.delta" && event.delta) {
          translationRef.current += event.delta;
          const nextCaption = captionWindow(translationRef.current);
          setTranslatedText(nextCaption);
          schedulePublish();
          schedulePartialWordFlush();
          scheduleAutoClear();
        }

        if (event.type === "session.input_transcript.delta" && event.delta) {
          sourceRef.current += event.delta;
          setSourceText(tail(sourceRef.current));
          schedulePublish();
        }

        if (event.type === "error") {
          setError(event.error?.message || "OpenAI reported a translation error.");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerResponse = await fetch(
        "https://api.openai.com/v1/realtime/translations/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretPayload.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      );
      if (!answerResponse.ok) {
        throw new Error("OpenAI rejected the live audio connection.");
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await answerResponse.text(),
      });
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Live translation could not start.",
      );
      stopEverything(false);
    }
  }

  function stopEverything(updateDisplay = true) {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    if (publishTimerRef.current) window.clearTimeout(publishTimerRef.current);
    if (partialFlushTimerRef.current) {
      window.clearTimeout(partialFlushTimerRef.current);
    }
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
    if (peerRef.current) {
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.ontrack = null;
      peerRef.current.close();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
    peerRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    setLevel(0);
    setRunState("idle");
    setDemoRunning(false);
    if (updateDisplay) void publishCaption({ status: "idle" });
  }

  async function sendManualCaption(text = manualText) {
    setError("");
    translationRef.current = text.trim();
    sourceRef.current = "Manual rehearsal caption";
    setTranslatedText(text.trim());
    setSourceText("Manual rehearsal caption");
    try {
      await publishCaption({
        translatedText: text.trim(),
        sourceText: "Manual rehearsal caption",
        visible: true,
        status: "rehearsal",
      });
      if (!visible) setVisible(true);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "The overhead display could not be updated.",
      );
    }
  }

  function runRehearsal() {
    if (demoRunning) {
      if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
      setDemoRunning(false);
      return;
    }

    let index = 0;
    setDemoRunning(true);
    setManualText(rehearsalLines[index]);
    void sendManualCaption(rehearsalLines[index]);
    demoTimerRef.current = window.setInterval(() => {
      index += 1;
      if (index >= rehearsalLines.length) {
        if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
        setDemoRunning(false);
        return;
      }
      setManualText(rehearsalLines[index]);
      void sendManualCaption(rehearsalLines[index]);
    }, 3500);
  }

  async function toggleVisibility() {
    const next = !visible;
    setVisible(next);
    await publishCaption({ visible: next });
  }

  async function clearCaption() {
    translationRef.current = "";
    setTranslatedText("");
    await publishCaption({ translatedText: "" });
  }

  function fullDisplayUrl() {
    return `${window.location.origin}/display/main`;
  }

  async function saveApiKey() {
    setApiKeyError("");
    if (apiKeyDraft.trim().length < 20) {
      setApiKeyError("Enter the complete OpenAI API key.");
      return;
    }

    setApiKeySaving(true);
    try {
      const response = await fetch("/api/settings/openai-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyDraft.trim() }),
      });
      const payload = (await response.json()) as {
        configured?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.configured) {
        throw new Error(payload.error || "The OpenAI key could not be saved.");
      }
      setApiKeyDraft("");
      setApiKeyConfigured(true);
    } catch (saveError) {
      setApiKeyError(
        saveError instanceof Error
          ? saveError.message
          : "The OpenAI key could not be saved.",
      );
    } finally {
      setApiKeySaving(false);
    }
  }

  async function testProPresenterConnection(
    candidate = presenterSettings,
  ) {
    if (!candidate) return;
    setPresenterConnection("testing");
    setPresenterError("");
    try {
      const response = await fetch("/api/propresenter/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: candidate.host,
          port: candidate.port,
        }),
      });
      const payload = (await response.json()) as {
        connected?: boolean;
        error?: string;
        version?: { description?: string };
        messages?: PresenterMessage[];
      };
      if (!response.ok || !payload.connected) {
        throw new Error(payload.error || "JerichoSpeech could not reach ProPresenter.");
      }

      const messages = payload.messages || [];
      const preferred =
        messages.find((message) => message.uuid === candidate.messageId) ||
        messages.find((message) => /jericho/i.test(message.name)) ||
        messages[0];
      const tokenName = preferred
        ? preferred.textTokens.includes(candidate.tokenName)
          ? candidate.tokenName
          : preferred.textTokens[0] || ""
        : "";

      setPresenterMessages(messages);
      setPresenterVersion(payload.version?.description || "ProPresenter");
      setPresenterConnection("connected");
      setPresenterSettings((current) =>
        current
          ? {
              ...current,
              messageId: preferred?.uuid || current.messageId,
              tokenName,
            }
          : current,
      );
      if (!messages.length) {
        setPresenterError("Create a Message in ProPresenter, then check again.");
      } else if (preferred && !preferred.textTokens.length) {
        setPresenterError(
          `The “${preferred.name}” Message needs a text token such as {Caption}.`,
        );
      }
    } catch (connectionError) {
      setPresenterConnection("idle");
      setPresenterMessages([]);
      setPresenterVersion("");
      setPresenterError(
        connectionError instanceof Error
          ? connectionError.message
          : "JerichoSpeech could not reach ProPresenter.",
      );
    }
  }

  function selectPresenterMessage(messageId: string) {
    const message = presenterMessages.find((candidate) => candidate.uuid === messageId);
    setPresenterSettings((current) =>
      current
        ? {
            ...current,
            messageId,
            tokenName: message?.textTokens[0] || "",
          }
        : current,
    );
    setPresenterError(
      message && !message.textTokens.length
        ? `The “${message.name}” Message needs a text token such as {Caption}.`
        : "",
    );
  }

  async function savePresenterSettings(enabled: boolean) {
    if (!presenterSettings) return;
    if (enabled && (!presenterSettings.messageId || !presenterSettings.tokenName)) {
      setPresenterError("Choose a Message with a text token before enabling direct output.");
      return;
    }

    setPresenterSaving(true);
    setPresenterError("");
    try {
      const response = await fetch("/api/settings/propresenter", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...presenterSettings, enabled }),
      });
      const payload = (await response.json()) as PresenterSettings & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "The ProPresenter connection could not be saved.");
      }
      setPresenterSettings(payload);
      if (enabled) {
        await testProPresenterConnection(payload);
      } else {
        setPresenterConnection("idle");
        setPresenterVersion("");
      }
    } catch (saveError) {
      setPresenterError(
        saveError instanceof Error
          ? saveError.message
          : "The ProPresenter connection could not be saved.",
      );
    } finally {
      setPresenterSaving(false);
    }
  }

  return (
    <main className="operator-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">J</div>
          <div>
            <h1 className="brand-name">JerichoSpeech</h1>
            <p className="brand-subtitle">Live translation console</p>
          </div>
        </div>
        <div className={`status-pill ${runState}`}>
          <span className="status-dot" />
          <span className="status-label">
            {runState === "live"
              ? "Translation live"
              : runState === "connecting"
                ? "Connecting"
                : "Ready"}
          </span>
        </div>
      </header>

      <div className="workspace">
        <section className="stack">
          {apiKeyConfigured === false ? (
            <div className="card key-setup-card">
              <div className="card-header">
                <h2 className="card-title">Connect OpenAI</h2>
                <span className="card-kicker">One-time setup</span>
              </div>
              <div className="card-body">
                <label className="field-label" htmlFor="openai-key">
                  OpenAI API key
                </label>
                <div className="key-setup-grid">
                  <input
                    id="openai-key"
                    className="control"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-…"
                    value={apiKeyDraft}
                    onChange={(event) => setApiKeyDraft(event.target.value)}
                  />
                  <button
                    className="button primary"
                    disabled={apiKeySaving}
                    onClick={saveApiKey}
                  >
                    {apiKeySaving ? "Saving…" : "Save securely"}
                  </button>
                </div>
                <p className="helper">
                  The installed Mac app encrypts this key with macOS secure storage.
                </p>
                {apiKeyError ? <p className="error-note">{apiKeyError}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Audio input</h2>
              <span className="card-kicker">
                {apiKeyConfigured ? "OpenAI ready · " : ""}English → Spanish
              </span>
            </div>
            <div className="card-body">
              <label className="field-label" htmlFor="microphone">
                Sanctuary microphone or mixer feed
              </label>
              <div className="select-row">
                <select
                  id="microphone"
                  className="control"
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  disabled={runState !== "idle"}
                >
                  <option value="">
                    {devices.length ? "Default microphone" : "Enable audio devices first"}
                  </option>
                  {devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Audio input ${index + 1}`}
                    </option>
                  ))}
                </select>
                <button className="button" onClick={loadDevices} disabled={runState !== "idle"}>
                  Enable
                </button>
              </div>
              <div className="meter-wrap" aria-label={`Input level ${level}%`}>
                <div className="meter">
                  <div className="meter-fill" style={{ width: `${level}%` }} />
                </div>
                <span className="meter-label">{level}%</span>
              </div>

              {runState === "idle" ? (
                <button className="button primary live-button" onClick={startLiveTranslation}>
                  Start live translation
                </button>
              ) : (
                <button className="button danger live-button" onClick={() => stopEverything()}>
                  Stop live translation
                </button>
              )}
              <p className="helper">
                The microphone stays in this browser. A short-lived OpenAI session carries the live audio.
              </p>
              {error ? <p className="error-note">{error}</p> : null}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Rehearsal mode</h2>
              <span className="card-kicker">No API key needed</span>
            </div>
            <div className="card-body">
              <label className="field-label" htmlFor="manual-caption">
                Spanish caption to send to the screens
              </label>
              <textarea
                id="manual-caption"
                className="textarea"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
              />
              <div className="button-row" style={{ marginTop: 10 }}>
                <button className="button primary" onClick={() => sendManualCaption()}>
                  Send to overhead
                </button>
                <button className="button" onClick={runRehearsal}>
                  {demoRunning ? "Stop sample" : "Run 3-line sample"}
                </button>
                <button className="button" onClick={clearCaption}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Output controls</h2>
            </div>
            <div className="card-body">
              <div className="toggle-row">
                <div>
                  <div className="field-label" style={{ margin: 0 }}>Show captions</div>
                  <div className="helper" style={{ margin: "3px 0 0" }}>Instant hide for the sanctuary screens</div>
                </div>
                <button
                  aria-label="Toggle caption visibility"
                  className={`switch ${visible ? "on" : ""}`}
                  onClick={toggleVisibility}
                />
              </div>
              <div className="toggle-row">
                <div>
                  <div className="field-label" style={{ margin: 0 }}>Monitor translated audio</div>
                  <div className="helper" style={{ margin: "3px 0 0" }}>Useful later for assisted-listening tests</div>
                </div>
                <button
                  aria-label="Toggle translated audio monitor"
                  className={`switch ${monitorAudio ? "on" : ""}`}
                  onClick={() => setMonitorAudio((current) => !current)}
                />
              </div>
            </div>
          </div>

          {presenterSettings ? (
            <div className="card presenter-card">
              <div className="card-header">
                <h2 className="card-title">ProPresenter direct</h2>
                <span className="card-kicker">
                  {presenterSettings.enabled
                    ? "Enabled"
                    : presenterConnection === "connected"
                      ? "Connected"
                      : "Optional"}
                </span>
              </div>
              <div className="card-body">
                <p className="helper presenter-intro">
                  Sends captions to a ProPresenter Message layer. ProPresenter 7.9 or newer is required.
                </p>
                <div className="presenter-address-grid">
                  <label>
                    <span className="field-label">Computer</span>
                    <input
                      className="control"
                      value={presenterSettings.host}
                      onChange={(event) =>
                        setPresenterSettings((current) =>
                          current ? { ...current, host: event.target.value } : current,
                        )
                      }
                      placeholder="127.0.0.1"
                    />
                  </label>
                  <label>
                    <span className="field-label">API port</span>
                    <input
                      className="control"
                      type="number"
                      min="1"
                      max="65535"
                      value={presenterSettings.port}
                      onChange={(event) =>
                        setPresenterSettings((current) =>
                          current
                            ? { ...current, port: Number(event.target.value) }
                            : current,
                        )
                      }
                    />
                  </label>
                  <button
                    className="button presenter-find-button"
                    disabled={presenterConnection === "testing"}
                    onClick={() => testProPresenterConnection()}
                  >
                    {presenterConnection === "testing" ? "Checking…" : "Find ProPresenter"}
                  </button>
                </div>

                {presenterConnection === "connected" ? (
                  <p className="connection-note">Connected to {presenterVersion}</p>
                ) : null}

                <div className="presenter-select-grid">
                  <label>
                    <span className="field-label">Caption Message</span>
                    <select
                      className="control"
                      value={presenterSettings.messageId}
                      disabled={!presenterMessages.length}
                      onChange={(event) => selectPresenterMessage(event.target.value)}
                    >
                      {!presenterMessages.length ? (
                        <option value="">Connect to load Messages</option>
                      ) : null}
                      {presenterMessages.map((message) => (
                        <option key={message.uuid} value={message.uuid}>
                          {message.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Text token</span>
                    <select
                      className="control"
                      value={presenterSettings.tokenName}
                      disabled={!presenterSettings.messageId}
                      onChange={(event) =>
                        setPresenterSettings((current) =>
                          current ? { ...current, tokenName: event.target.value } : current,
                        )
                      }
                    >
                      {(
                        presenterMessages.find(
                          (message) => message.uuid === presenterSettings.messageId,
                        )?.textTokens || []
                      ).length ? (
                        presenterMessages
                          .find((message) => message.uuid === presenterSettings.messageId)
                          ?.textTokens.map((token) => (
                            <option key={token} value={token}>
                              {token}
                            </option>
                          ))
                      ) : (
                        <option value="">No text tokens found</option>
                      )}
                    </select>
                  </label>
                </div>

                <div className="button-row presenter-actions">
                  <button
                    className="button primary"
                    disabled={presenterSaving}
                    onClick={() => savePresenterSettings(true)}
                  >
                    {presenterSaving
                      ? "Saving…"
                      : presenterSettings.enabled
                        ? "Save connection"
                        : "Enable direct output"}
                  </button>
                  {presenterSettings.enabled ? (
                    <button
                      className="button"
                      disabled={presenterSaving}
                      onClick={() => savePresenterSettings(false)}
                    >
                      Disable
                    </button>
                  ) : null}
                </div>
                <p className="helper">
                  Create a ProPresenter Message containing {"{Caption}"}, then select it here.
                </p>
                {presenterError ? <p className="error-note">{presenterError}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="stack">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Live transcript</h2>
              <span className="card-kicker">Low latency · last 24 words</span>
            </div>
            <div className="translation-readout">
              <p className="readout-label">Spanish output</p>
              <p className={`translation-text ${translatedText ? "" : "translation-placeholder"}`}>
                {translatedText || "Translated captions will appear here."}
              </p>
            </div>
            <div className="source-readout">
              <strong>English source: </strong>
              {sourceText || "Waiting for speech…"}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Overhead screen</h2>
              <span className="card-kicker">16:9 preview</span>
            </div>
            <div className="preview-frame">
              <iframe title="Overhead caption preview" src="/display/main?preview=1" />
            </div>
            <div className="output-tools">
              <div className="url-box" title="/display/main">/display/main</div>
              <div className="button-row">
                <button className="button" onClick={() => navigator.clipboard.writeText(fullDisplayUrl())}>
                  Copy URL
                </button>
                <a className="button" href="/display/main" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  Open display
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline muted={!monitorAudio} />
    </main>
  );
}
