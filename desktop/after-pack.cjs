/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * iCloud Drive can add Finder metadata to extracted Electron binaries. Apple
 * refuses to sign executables carrying those extended attributes, so remove
 * them immediately after packaging and before electron-builder signs the app.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  execFileSync("xattr", ["-cr", appPath], { stdio: "inherit" });
};
