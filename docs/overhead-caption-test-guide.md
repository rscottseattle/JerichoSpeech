# JerichoSpeech overhead-caption test

## What is ready

- Operator console at `http://localhost:3000`
- Transparent caption output at `http://localhost:3000/display/main`
- Manual caption publishing and an automatic three-line Spanish rehearsal
- Caption show/hide and clear controls
- OpenAI Realtime English-to-Spanish connection, ready when an API key is added

## Five-minute screen test

1. Keep JerichoSpeech running on the ProPresenter computer.
2. Open `http://localhost:3000` in Chrome.
3. In ProPresenter, add a Web Fill using `http://localhost:3000/display/main`.
4. Size the Web Fill to the full output canvas. The webpage itself is transparent; only the black caption panel should appear.
5. In JerichoSpeech, choose **Run 3-line sample** under **Rehearsal mode**.
6. Confirm that each Spanish caption reaches the overhead output and remains readable from the back of the sanctuary.
7. Test **Show captions**, **Clear**, and a custom Spanish line.

## Live microphone test

1. Add `OPENAI_API_KEY` to `.env.local` and restart JerichoSpeech.
2. Choose **Enable**, approve microphone access, and select the sanctuary mixer feed.
3. Confirm the input meter responds to speech.
4. Choose **Start live translation** and speak English at sermon pace.
5. Confirm Spanish text appears in the console and the overhead output.
6. Measure normal speaking-to-screen delay and note mistranslated church names, Bible books, and local terms for the glossary milestone.

## First test acceptance targets

- The display opens without browser chrome or a visible page background.
- Captions remain within two lines at normal 1080p output.
- Show, hide, and clear react in under one second on the same computer.
- A brief connection interruption does not immediately erase the last caption.
- Live captions clear after roughly eight seconds of silence.

This build is intended for a controlled local test. Authentication, operator accounts, remote phone viewers, service history, and production deployment belong to later milestones in the master plan.
