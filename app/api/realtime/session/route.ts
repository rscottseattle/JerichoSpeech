import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Live translation needs an OPENAI_API_KEY. The rehearsal controls are ready to test without one.",
      },
      { status: 503 },
    );
  }

  const upstream = await fetch(
    "https://api.openai.com/v1/realtime/translations/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: "gpt-realtime-translate",
          audio: {
            input: {
              transcription: { model: "gpt-realtime-whisper" },
              noise_reduction: null,
            },
            output: { language: "es" },
          },
        },
      }),
    },
  );

  const payload = await upstream.json();
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "OpenAI could not start the translation session.", detail: payload },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
