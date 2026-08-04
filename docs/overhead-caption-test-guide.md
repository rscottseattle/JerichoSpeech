# JerichoSpeech overhead-caption test

## What is ready

- Operator console at `http://localhost:3000`
- Transparent caption output at `http://localhost:3000/display/main`
- Manual caption publishing and an automatic three-line Spanish rehearsal
- Caption show/hide and clear controls
- Saved preferred-terminology replacements in the installed Mac app
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
6. Add any recurring mistranslations under **Preferred terminology** in the form `current wording = preferred caption`, save, and repeat the phrase.

## First test acceptance targets

- The display opens without browser chrome or a visible page background.
- At 1920×1080, the caption panel spans approximately 80% of the screen width.
- Avenir Next Demi, open tracking, and off-white text remain legible without appearing bulky.
- Captions remain within the three-line viewport at normal 1080p output; an entering row stays clipped below it.
- New words arrive in gentle phrase groups rather than flickering one word at a time.
- Completed lines remain immutable while new words build from left to right on the bottom line.
- Sentence and clause boundaries are preferred when a row is sufficiently full, and one- or two-word orphan rows are not created voluntarily.
- Caption polling gaps do not force short or premature line breaks.
- When a new row begins, the caption viewport glides upward by exactly one line and then stops before any later row advances.
- The current reading row is brightest, with the two preceding rows subtly softened.
- Show, hide, and clear react in under one second on the same computer.
- Low-latency relay publishes completed words about every 50 milliseconds and refreshes the display every 75 milliseconds.
- A brief connection interruption does not immediately erase the last caption.
- Silence never clears the display. The last three lines remain until **Stop live translation** or **Clear** is used.
- Preferred terminology changes apply only before text is revealed; committed lines are never rewritten.

This build is intended for a controlled local test. Authentication, operator accounts, remote phone viewers, service history, and production deployment belong to later milestones in the master plan.
