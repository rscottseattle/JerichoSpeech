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
const temporaryProject = fs.mkdtempSync(
  path.join(os.tmpdir(), "jerichospeech-project-")
);
const builder = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  "electron-builder"
);

try {
  const sourcePackage = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
  );
  const electronPackage = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, "node_modules", "electron", "package.json"),
      "utf8"
    )
  );
  const stagedPackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    author: sourcePackage.author,
    private: true,
    main: sourcePackage.main,
    build: {
      ...sourcePackage.build,
      electronVersion: electronPackage.version,
      npmRebuild: false,
      directories: { output: temporaryOutput },
    },
  };

  fs.mkdirSync(path.join(temporaryProject, "desktop"), { recursive: true });
  for (const name of [
    "after-pack.cjs",
    "entitlements.mac.plist",
    "main.cjs",
    "propresenter.cjs",
  ]) {
    fs.copyFileSync(
      path.join(projectRoot, "desktop", name),
      path.join(temporaryProject, "desktop", name)
    );
  }
  fs.cpSync(
    path.join(projectRoot, "desktop-dist"),
    path.join(temporaryProject, "desktop-dist"),
    { recursive: true }
  );
  fs.writeFileSync(
    path.join(temporaryProject, "package.json"),
    JSON.stringify(stagedPackage, null, 2)
  );

  execFileSync(
    builder,
    [
      "--mac",
      "dmg",
      "--arm64",
      `--projectDir=${temporaryProject}`,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }
  );

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
  fs.rmSync(temporaryProject, { recursive: true, force: true });
}
