import { eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureLiveChannelsTable, getDb } from "../../../../../db";
import { liveChannels } from "../../../../../db/schema";

type RouteContext = { params: Promise<{ channel: string }> };

function validChannel(channel: string) {
  return /^[a-z0-9-]{1,40}$/.test(channel);
}

async function getOrCreateChannel(channel: string) {
  await ensureLiveChannelsTable();
  const db = getDb();
  const existing = await db.query.liveChannels.findFirst({
    where: eq(liveChannels.channel, channel),
  });

  if (existing) return existing;

  await db
    .insert(liveChannels)
    .values({ channel, updatedAt: new Date().toISOString() })
    .onConflictDoNothing();

  return db.query.liveChannels.findFirst({
    where: eq(liveChannels.channel, channel),
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { channel } = await context.params;
  if (!validChannel(channel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const state = await getOrCreateChannel(channel);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { channel } = await context.params;
  if (!validChannel(channel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const body = (await request.json()) as {
    sourceText?: unknown;
    translatedText?: unknown;
    visible?: unknown;
    status?: unknown;
  };

  await ensureLiveChannelsTable();
  const db = getDb();
  const sourceText =
    typeof body.sourceText === "string" ? body.sourceText.slice(-4000) : undefined;
  const translatedText =
    typeof body.translatedText === "string"
      ? body.translatedText.slice(-2000)
      : undefined;
  const visible = typeof body.visible === "boolean" ? body.visible : undefined;
  const status =
    typeof body.status === "string" ? body.status.slice(0, 30) : undefined;
  const updatedAt = new Date().toISOString();

  const updateSet: {
    sourceText?: string;
    translatedText?: string;
    visible?: boolean;
    status?: string;
    sequence: SQL;
    updatedAt: string;
  } = {
    sequence: sql`${liveChannels.sequence} + 1`,
    updatedAt,
  };

  if (sourceText !== undefined) updateSet.sourceText = sourceText;
  if (translatedText !== undefined) updateSet.translatedText = translatedText;
  if (visible !== undefined) updateSet.visible = visible;
  if (status !== undefined) updateSet.status = status;

  const [next] = await db
    .insert(liveChannels)
    .values({
      channel,
      sourceText: sourceText ?? "",
      translatedText: translatedText ?? "",
      visible: visible ?? true,
      status: status ?? "idle",
      sequence: 1,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: liveChannels.channel,
      set: updateSet,
    })
    .returning();

  return NextResponse.json(next);
}
