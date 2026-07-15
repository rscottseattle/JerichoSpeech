/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "release");
const temporaryOutput = fs.mkdtempSync(
  path.join(os.tmpdir(), "jerichospeech-build-")
);
const builder = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  "electron-builder"
);

try {
  execFileSync(
    builder,
    [
      "--mac",
      "dmg",
      "--arm64",
      `--config.directories.output=${temporaryOutput}`,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }
  );

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const artifacts = fs
    .readdirSync(temporaryOutput)
    .filter((name) => name.endsWith(".dmg") || name.endsWith(".dmg.blockmap"));

  if (!artifacts.some((name) => name.endsWith(".dmg"))) {
    throw new Error("The Mac installer was not created.");
  }

  for (const artifact of artifacts) {
    fs.copyFileSync(
      path.join(temporaryOutput, artifact),
      path.join(outputDir, artifact)
    );
  }
} finally {
  fs.rmSync(temporaryOutput, { recursive: true, force: true });
}
