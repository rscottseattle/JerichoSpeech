import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { supported: false, value: "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "Preferred terminology can only be saved inside the installed JerichoSpeech Mac app.",
    },
    { status: 405 },
  );
}
