/* eslint-disable @typescript-eslint/no-require-imports */
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.setName("JerichoSpeech");

function readExistingKey() {
  const environmentFile = path.join(__dirname, "..", ".env.local");
  const contents = fs.readFileSync(environmentFile, "utf8");
  const line = contents
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith("OPENAI_API_KEY="));
  if (!line) return "";
  let value = line.slice(line.indexOf("=") + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

app.whenReady().then(() => {
  const apiKey = readExistingKey();
  if (apiKey.length < 20) {
    console.error("No complete OpenAI key was found in .env.local.");
    app.exit(1);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.error("macOS secure storage is unavailable.");
    app.exit(1);
    return;
  }

  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      openaiKeyEncrypted: safeStorage.encryptString(apiKey).toString("base64"),
    }),
    { mode: 0o600 },
  );
  console.log("The OpenAI key was imported into macOS secure storage.");
  app.quit();
});
