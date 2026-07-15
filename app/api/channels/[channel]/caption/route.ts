import { eq } from "drizzle-orm";
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
  const now = new Date().toISOString();

  await db
    .insert(liveChannels)
    .values({ channel, updatedAt: now })
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

  const current = await getOrCreateChannel(channel);
  if (!current) {
    return NextResponse.json({ error: "Channel unavailable." }, { status: 500 });
  }

  const body = (await request.json()) as {
    sourceText?: unknown;
    translatedText?: unknown;
    visible?: unknown;
    status?: unknown;
  };

  const next = {
    sourceText:
      typeof body.sourceText === "string"
        ? body.sourceText.slice(-4000)
        : current.sourceText,
    translatedText:
      typeof body.translatedText === "string"
        ? body.translatedText.slice(-2000)
        : current.translatedText,
    visible: typeof body.visible === "boolean" ? body.visible : current.visible,
    status:
      typeof body.status === "string" ? body.status.slice(0, 30) : current.status,
    sequence: current.sequence + 1,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  await db
    .update(liveChannels)
    .set(next)
    .where(eq(liveChannels.channel, channel));

  return NextResponse.json({ channel, ...next });
}
