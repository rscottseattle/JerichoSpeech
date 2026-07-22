const DEFAULT_PROPRESENTER_SETTINGS = Object.freeze({
  enabled: false,
  host: "127.0.0.1",
  port: 50001,
  messageId: "",
  tokenName: "Caption",
});

function normalizeProPresenterSettings(input = {}) {
  const host = typeof input.host === "string" ? input.host.trim() : "";
  const port = Number(input.port);
  const messageId =
    typeof input.messageId === "string" ? input.messageId.trim() : "";
  const tokenName =
    typeof input.tokenName === "string" ? input.tokenName.trim() : "";

  if (!host || host.length > 255 || !/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error("Enter a valid ProPresenter computer name or IP address.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Enter a valid ProPresenter API port.");
  }
  if (messageId.length > 100 || tokenName.length > 100) {
    throw new Error("The ProPresenter message or token name is too long.");
  }

  return {
    enabled: Boolean(input.enabled),
    host,
    port,
    messageId,
    tokenName: tokenName || DEFAULT_PROPRESENTER_SETTINGS.tokenName,
  };
}

function presenterUrl(settings, pathname) {
  return `http://${settings.host}:${settings.port}${pathname}`;
}

async function presenterRequest(settings, pathname, init = {}) {
  const response = await fetch(presenterUrl(settings, pathname), {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail || `ProPresenter returned HTTP ${response.status}.`,
    );
  }
  return response;
}

function publicMessage(message) {
  const id = message?.id || {};
  const textTokens = Array.isArray(message?.tokens)
    ? message.tokens
        .filter((token) => token && token.text && typeof token.name === "string")
        .map((token) => token.name)
    : [];

  return {
    uuid: typeof id.uuid === "string" ? id.uuid : "",
    name: typeof id.name === "string" ? id.name : "Untitled message",
    index: Number.isInteger(id.index) ? id.index : 0,
    textTokens,
  };
}

async function discoverProPresenter(settingsInput) {
  const settings = normalizeProPresenterSettings(settingsInput);
  try {
    const [versionResponse, messagesResponse] = await Promise.all([
      presenterRequest(settings, "/version"),
      presenterRequest(settings, "/v1/messages"),
    ]);
    const [version, messages] = await Promise.all([
      versionResponse.json(),
      messagesResponse.json(),
    ]);

    return {
      connected: true,
      version: {
        name: typeof version.name === "string" ? version.name : "ProPresenter",
        description:
          typeof version.host_description === "string"
            ? version.host_description
            : "ProPresenter",
        apiVersion:
          typeof version.api_version === "string" ? version.api_version : "v1",
      },
      messages: Array.isArray(messages) ? messages.map(publicMessage) : [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Connection failed.";
    throw new Error(
      `JerichoSpeech could not reach the ProPresenter Messages API at ${settings.host}:${settings.port}. ${reason}`,
    );
  }
}

async function sendProPresenterCaption(settingsInput, caption) {
  const settings = normalizeProPresenterSettings(settingsInput);
  if (!settings.messageId || !settings.tokenName) {
    throw new Error("Choose a ProPresenter message and text token first.");
  }

  const message = encodeURIComponent(settings.messageId);
  const text = typeof caption.translatedText === "string"
    ? caption.translatedText.trim()
    : "";

  if (!caption.visible || !text) {
    await presenterRequest(settings, `/v1/message/${message}/clear`);
    return { action: "clear" };
  }

  await presenterRequest(settings, `/v1/message/${message}/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        name: settings.tokenName,
        text: { text },
      },
    ]),
  });
  return { action: "show" };
}

module.exports = {
  DEFAULT_PROPRESENTER_SETTINGS,
  discoverProPresenter,
  normalizeProPresenterSettings,
  sendProPresenterCaption,
};
