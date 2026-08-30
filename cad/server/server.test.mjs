import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import { createCadApiHandler } from "./cad-api-handlers.mjs";

function createHarness() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cad-server-test-"));
  fs.mkdirSync(path.join(workspaceRoot, "workspaces"), { recursive: true });
  return {
    workspaceRoot,
    handle: createCadApiHandler({
      workspaceRoot,
      generationState: new Map(),
    }),
    cleanup() {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}

async function invoke(handle, {
  method = "GET",
  url = "/",
  headers = {},
  body = Buffer.alloc(0),
} = {}) {
  const request = Readable.from(body.byteLength ? [body] : []);
  request.method = method;
  request.url = url;
  request.headers = {
    ...headers,
    ...(body.byteLength ? { "content-length": String(body.byteLength) } : {}),
  };
  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  response.headers = {};
  response.statusCode = 200;
  response.setHeader = (name, value) => {
    response.headers[String(name).toLowerCase()] = value;
  };
  response.writeHead = (status, nextHeaders = {}) => {
    response.statusCode = status;
    for (const [name, value] of Object.entries(nextHeaders)) {
      response.setHeader(name, value);
    }
    return response;
  };
  const finished = once(response, "finish");
  await handle(request, response);
  await finished;
  const bytes = Buffer.concat(chunks);
  return {
    status: response.statusCode,
    headers: response.headers,
    bytes,
    json: response.headers["content-type"]?.startsWith("application/json")
      ? JSON.parse(bytes.toString("utf8"))
      : null,
  };
}

test("health, upload, catalog, asset, and traversal behavior", async () => {
  const harness = createHarness();
  try {
    const health = await invoke(harness.handle, { url: "/health" });
    assert.equal(health.status, 200);
    assert.equal(health.json.sealed, true);

    const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
    const upload = await invoke(harness.handle, {
      method: "POST",
      url: "/step-artifact?workspace=fixture-a1&file=fixture.glb",
      headers: {
        "content-type": "model/gltf-binary",
      },
      body: bytes,
    });
    assert.equal(upload.status, 201);
    assert.equal(upload.json.ok, true);

    const catalog = await invoke(harness.handle, { url: "/catalog" });
    assert.equal(catalog.json.entries.length, 1);
    assert.equal(catalog.json.entries[0].file, "fixture-a1/fixture.glb");

    const asset = await invoke(harness.handle, {
      url: `/asset?file=${encodeURIComponent("workspaces/fixture-a1/fixture.glb")}`,
    });
    assert.equal(asset.status, 200);
    assert.deepEqual(asset.bytes, bytes);

    const traversal = await invoke(harness.handle, {
      url: `/asset?file=${encodeURIComponent("../outside.step")}`,
    });
    assert.equal(traversal.status, 400);
  } finally {
    harness.cleanup();
  }
});

test("unknown routes fail closed", async () => {
  const harness = createHarness();
  try {
    const response = await invoke(harness.handle, { url: "/__cad/reveal" });
    assert.equal(response.status, 404);
  } finally {
    harness.cleanup();
  }
});
