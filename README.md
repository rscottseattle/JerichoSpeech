# JerichoSpeech

JerichoSpeech turns an English microphone or mixer feed into Spanish captions for an overhead screen. The first milestone includes an operator console, an OpenAI Realtime translation connection, and a transparent browser output for ProPresenter.

## Test the overhead display

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000` for the operator console.
3. Open `http://localhost:3000/display/main` in another browser window or in a ProPresenter Web Fill.
4. Use **Rehearsal mode** to publish captions without an OpenAI key.

For live translation, copy `.env.example` to `.env.local`, add `OPENAI_API_KEY`, and restart the app. The key stays on the server; the browser receives only a short-lived Realtime session secret.

The product and development plan is in [`docs/master-build-plan.md`](docs/master-build-plan.md).
