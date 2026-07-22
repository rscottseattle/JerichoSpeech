# JerichoSpeech for Mac

## Install

1. Open the JerichoSpeech DMG installer.
2. Drag **JerichoSpeech** into **Applications**.
3. Open JerichoSpeech from Applications.
4. If macOS asks for microphone access, choose **Allow**.

The first time JerichoSpeech opens, enter the OpenAI API key in the setup card if one has not already been saved. The desktop app encrypts it using macOS secure storage.

## Direct ProPresenter integration

Direct output requires ProPresenter 7.9 or newer. It uses ProPresenter's official local Messages API; it does not modify slides, playlists, mixer channels, or audio settings.

### Set up ProPresenter

1. Open **ProPresenter > Settings** and choose **Network**.
2. Turn on **Enable Network**. Leave the API port at `50001` unless that port is already in use.
3. Open **Show Controls > Messages**.
4. Create a Message named **JerichoSpeech Captions**.
5. Set its message text to `{Caption}`. `Caption` must be a text token with that exact capitalization.
6. Apply or create a lower-third Theme for the Message. Give its text box enough height for three lines and position it along the bottom of the audience canvas.
7. In the active Audience Look, make sure the **Messages** layer is enabled for the sanctuary screen.

### Connect JerichoSpeech

1. Keep ProPresenter open.
2. Open JerichoSpeech and find the **ProPresenter direct** card.
3. If both apps are on the same Mac, leave the computer as `127.0.0.1` and the port as `50001`.
4. Click **Find ProPresenter**.
5. Choose **JerichoSpeech Captions** and the **Caption** text token.
6. Click **Enable direct output**.
7. In Rehearsal mode, click **Send to overhead** to verify that the Message appears. **Clear** and **Show captions** also control the ProPresenter Message.

JerichoSpeech remembers this connection. The next time both apps are running, direct caption output resumes automatically.

## Web Fill fallback

Keep JerichoSpeech running, then add this address as a ProPresenter Web Fill:

`http://127.0.0.1:3838/display/main`

That address is available only on the Mac running JerichoSpeech. It does not expose the caption feed to the public internet.

## Internet connection

The operator screen, caption display, and local caption relay run on the Mac. Only live speech recognition and translation require an internet connection because those features connect to OpenAI.

## Closing the app

Closing the JerichoSpeech window leaves the local caption display running for ProPresenter. Choose **JerichoSpeech > Quit JerichoSpeech** when you want to stop it completely.
