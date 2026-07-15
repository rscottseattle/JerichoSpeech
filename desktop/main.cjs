/* eslint-disable @typescript-eslint/no-require-imports */
const {
  app,
  BrowserWindow,
  dialog,
  safeStorage,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

app.setName("JerichoSpeech");

const HOST = "127.0.0.1";
const PORT = 3838;
const ORIGIN = `http://${HOST}:${PORT}`;
const rendererRoot = path.join(__dirname, "..", "desktop-dist", "renderer");
const channels = new Map();
let mainWindow = null;
let localServer = null;
let stateSaveTimer = null;

function json(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function defaultChannel(channel) {
  return {
    channel,
    sourceText: "",
    translatedText: "",
    visible: true,
    status: "idle",
    sequence: 0,
    updatedAt: new Date().toISOString(),
  };
}

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function loadChannels() {
  try {
    const stored = JSON.parse(fs.readFileSync(userFile("caption-state.json"), "utf8"));
    for (const state of stored) {
      if (state && /^[a-z0-9-]{1,40}$/.test(state.channel)) {
        channels.set(state.channel, { ...defaultChannel(state.channel), ...state });
      }
    }
  } catch {
    // A new installation starts with an empty local caption state.
  }
}

function saveChannelsNow() {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = null;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const destination = userFile("caption-state.json");
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...channels.values()]), {
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
}

function scheduleChannelSave() {
  if (stateSaveTimer) return;
  stateSaveTimer = setTimeout(saveChannelsNow, 750);
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(userFile("settings.json"), "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userFile("settings.json"), JSON.stringify(settings), {
    mode: 0o600,
  });
}

function getOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const encrypted = loadSettings().openaiKeyEncrypted;
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return "";
  }
}

function storeOpenAIKey(apiKey) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("macOS secure storage is unavailable.");
  }
  const settings = loadSettings();
  settings.openaiKeyEncrypted = safeStorage
    .encryptString(apiKey)
    .toString("base64");
  saveSettings(settings);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  }[extension] || "application/octet-stream";
}

function serveRenderer(request, response, url) {
  const isAppRoute =
    url.pathname === "/" || /^\/display\/[a-z0-9-]+$/.test(url.pathname);
  const requested = isAppRoute ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(rendererRoot, requested);
  if (!filePath.startsWith(`${path.resolve(rendererRoot)}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": filePath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
      "Content-Type": contentType(filePath),
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", ORIGIN);

    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, {
        status: "ready",
        openaiConfigured: Boolean(getOpenAIKey()),
        displayUrl: `${ORIGIN}/display/main`,
      });
      return;
    }

    if (url.pathname === "/api/settings/openai-key") {
      if (request.method === "GET") {
        json(response, 200, { configured: Boolean(getOpenAIKey()) });
        return;
      }
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        if (apiKey.length < 20) {
          json(response, 400, { error: "Enter a complete OpenAI API key." });
          return;
        }
        storeOpenAIKey(apiKey);
        json(response, 200, { configured: true });
        return;
      }
      json(response, 405, { error: "Method not allowed." });
      return;
    }

    const channelMatch = url.pathname.match(
      /^\/api\/channels\/([a-z0-9-]{1,40})\/caption$/,
    );
    if (channelMatch) {
      const channel = channelMatch[1];
      const current = channels.get(channel) || defaultChannel(channel);
      if (request.method === "GET") {
        channels.set(channel, current);
        json(response, 200, current);
        return;
      }
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        const next = {
          ...current,
          sourceText:
            typeof body.sourceText === "string"
              ? body.sourceText.slice(-4000)
              : current.sourceText,
          translatedText:
            typeof body.translatedText === "string"
              ? body.translatedText.slice(-2000)
              : current.translatedText,
          visible:
            typeof body.visible === "boolean" ? body.visible : current.visible,
          status:
            typeof body.status === "string"
              ? body.status.slice(0, 30)
              : current.status,
          sequence: current.sequence + 1,
          updatedAt: new Date().toISOString(),
        };
        channels.set(channel, next);
        scheduleChannelSave();
        json(response, 200, next);
        return;
      }
      json(response, 405, { error: "Method not allowed." });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/realtime/session") {
      const apiKey = getOpenAIKey();
      if (!apiKey) {
        json(response, 503, {
          error: "Add an OpenAI API key in JerichoSpeech before starting translation.",
        });
        return;
      }

      const upstream = await fetch(
        "https://api.openai.com/v1/realtime/translations/client_secrets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session: {
              model: "gpt-realtime-translate",
              audio: {
                input: {
                  transcription: { model: "gpt-realtime-whisper" },
                  noise_reduction: null,
                },
                output: { language: "es" },
              },
            },
          }),
        },
      );

      const payload = await upstream.text();
      response.writeHead(upstream.status, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(payload);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      serveRenderer(request, response, url);
      return;
    }

    json(response, 404, { error: "Not found." });
  } catch (error) {
    json(response, 500, {
      error: error instanceof Error ? error.message : "JerichoSpeech failed.",
    });
  }
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    localServer = http.createServer(handleRequest);
    localServer.once("error", reject);
    localServer.listen(PORT, HOST, () => resolve());
  });
}

function configurePermissions() {
  const allowLocalMedia = (webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    callback(permission === "media" && requestingUrl.startsWith(ORIGIN));
  };
  session.defaultSession.setPermissionRequestHandler(allowLocalMedia);
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      permission === "media" && requestingOrigin.startsWith(ORIGIN),
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: "#0a0b0c",
    title: "JerichoSpeech",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) void shell.openExternal(url);
    return { action: "deny" };
  });
  void mainWindow.loadURL(ORIGIN);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      loadChannels();
      configurePermissions();
      await startLocalServer();

      if (process.argv.includes("--smoke-test")) {
        const health = await fetch(`${ORIGIN}/api/health`).then((response) =>
          response.json(),
        );
        const home = await fetch(ORIGIN);
        const display = await fetch(`${ORIGIN}/display/main`);
        const writtenCaption = await fetch(
          `${ORIGIN}/api/channels/desktop-test/caption`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              translatedText: "Prueba de escritorio",
              visible: true,
              status: "rehearsal",
            }),
          },
        ).then((response) => response.json());
        if (
          health.status !== "ready" ||
          !home.ok ||
          !display.ok ||
          writtenCaption.translatedText !== "Prueba de escritorio"
        ) {
          throw new Error("Desktop smoke test failed.");
        }
        console.log("JerichoSpeech desktop server is ready.");
        localServer.close(() => app.quit());
        return;
      }

      createWindow();
    } catch (error) {
      dialog.showErrorBox(
        "JerichoSpeech could not start",
        error instanceof Error ? error.message : "The local server could not start.",
      );
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!mainWindow && localServer) createWindow();
  });

  app.on("before-quit", () => {
    if (channels.size) saveChannelsNow();
    localServer?.close();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
