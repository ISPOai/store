import assert from "node:assert/strict";
import test from "node:test";

import { projectIdFromLocation } from "../src/features/generations/generation-model.ts";

const PROJECT_ID = "proj_0123456789abcdef0123456789abcdef";

test("reads the installed project id from a sealed project origin", () => {
  assert.equal(projectIdFromLocation({
    protocol: "project:",
    hostname: PROJECT_ID,
    pathname: "/",
  }), PROJECT_ID);
});

test("reads the project id from a pooled workspace path", () => {
  assert.equal(projectIdFromLocation({
    protocol: "apps:",
    hostname: "workspace",
    pathname: `/${PROJECT_ID}/`,
  }), PROJECT_ID);
});

test("rejects a surface without an ISPO project identity", () => {
  assert.throws(
    () => projectIdFromLocation({
      protocol: "https:",
      hostname: "example.com",
      pathname: "/",
    }),
    /ISPO project surface/,
  );
});
