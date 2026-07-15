import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.OPENAI_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT() {
  return NextResponse.json(
    { error: "API keys can only be saved inside the installed JerichoSpeech Mac app." },
    { status: 405 },
  );
}
