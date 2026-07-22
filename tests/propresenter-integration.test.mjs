import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  discoverProPresenter,
  sendProPresenterCaption,
} = require("../desktop/propresenter.cjs");

test("discovers ProPresenter Messages and sends caption tokens", async (context) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({
      method: request.method,
      url: request.url,
      body: Buffer.concat(chunks).toString("utf8"),
    });

    if (request.url === "/version") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        name: "Sanctuary",
        host_description: "ProPresenter test",
        api_version: "v1",
      }));
      return;
    }
    if (request.url === "/v1/messages") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify([
        {
          id: { uuid: "message-uuid", name: "JerichoSpeech Captions", index: 0 },
          tokens: [{ name: "Caption", text: { text: "" } }],
        },
      ]));
      return;
    }
    response.writeHead(204).end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const settings = {
    enabled: true,
    host: "127.0.0.1",
    port: address.port,
    messageId: "message-uuid",
    tokenName: "Caption",
  };
  const discovered = await discoverProPresenter(settings);
  assert.equal(discovered.connected, true);
  assert.deepEqual(discovered.messages[0].textTokens, ["Caption"]);

  await sendProPresenterCaption(settings, {
    translatedText: "Bienvenidos a la iglesia.",
    visible: true,
  });
  await sendProPresenterCaption(settings, {
    translatedText: "",
    visible: false,
  });

  const trigger = requests.find((request) => request.url?.endsWith("/trigger"));
  assert.equal(trigger?.method, "POST");
  assert.deepEqual(JSON.parse(trigger?.body || "[]"), [
    { name: "Caption", text: { text: "Bienvenidos a la iglesia." } },
  ]);
  assert.ok(requests.some((request) => request.url?.endsWith("/clear")));
});
