# JerichoSpeech for Mac

## Install

1. Open the JerichoSpeech DMG installer.
2. Drag **JerichoSpeech** into **Applications**.
3. Open JerichoSpeech from Applications.
4. If macOS asks for microphone access, choose **Allow**.

The first time JerichoSpeech opens, enter the OpenAI API key in the setup card if one has not already been saved. The desktop app encrypts it using macOS secure storage.

## Use with ProPresenter

Keep JerichoSpeech running, then add this address as a ProPresenter Web Fill:

`http://127.0.0.1:3838/display/main`

That address is available only on the Mac running JerichoSpeech. It does not expose the caption feed to the public internet.

## Internet connection

The operator screen, caption display, and local caption relay run on the Mac. Only live speech recognition and translation require an internet connection because those features connect to OpenAI.

## Closing the app

Closing the JerichoSpeech window leaves the local caption display running for ProPresenter. Choose **JerichoSpeech > Quit JerichoSpeech** when you want to stop it completely.
