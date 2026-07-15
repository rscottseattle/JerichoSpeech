# JerichoSpeech

JerichoSpeech turns an English microphone or mixer feed into Spanish captions for an overhead screen. The first milestone includes an operator console, an OpenAI Realtime translation connection, and a transparent browser output for ProPresenter.

## Test the overhead display

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000` for the operator console.
3. Open `http://localhost:3000/display/main` in another browser window or in a ProPresenter Web Fill.
4. Use **Rehearsal mode** to publish captions without an OpenAI key.

For live translation, copy `.env.example` to `.env.local`, add `OPENAI_API_KEY`, and restart the app. The key stays on the server; the browser receives only a short-lived Realtime session secret.

The product and development plan is in [`docs/master-build-plan.md`](docs/master-build-plan.md).

## Mac app

The desktop build runs JerichoSpeech and its caption display entirely on the Mac. Launch **JerichoSpeech** from Applications, choose the microphone or mixer input, and click **Enable microphone**.

Use this address for a ProPresenter Web Fill on the same Mac:

`http://127.0.0.1:3838/display/main`

The local operator and display pages work without an internet connection. Live transcription and translation still need internet access to OpenAI. See [`docs/mac-installation.md`](docs/mac-installation.md) for installation and operating notes.
