import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const liveChannels = sqliteTable("live_channels", {
  channel: text("channel").primaryKey(),
  sourceText: text("source_text").notNull().default(""),
  translatedText: text("translated_text").notNull().default(""),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("idle"),
  sequence: integer("sequence").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
