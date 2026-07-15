import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let liveChannelsTableReady: Promise<void> | null = null;

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureLiveChannelsTable() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  if (!liveChannelsTableReady) {
    liveChannelsTableReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS live_channels (
        channel TEXT PRIMARY KEY NOT NULL,
        source_text TEXT NOT NULL DEFAULT '',
        translated_text TEXT NOT NULL DEFAULT '',
        visible INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'idle',
        sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`,
    )
      .run()
      .then(() => undefined)
      .catch((error) => {
        liveChannelsTableReady = null;
        throw error;
      });
  }

  await liveChannelsTableReady;
}
