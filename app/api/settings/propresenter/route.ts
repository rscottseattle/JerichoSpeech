import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { supported: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Direct ProPresenter output is available in the installed JerichoSpeech Mac app." },
    { status: 405 },
  );
}
