// Loads the built CJS bundle and checks the public surface.
const assert = require("assert");
const Captivate = require("../dist/index.cjs.js");
const { CaptivateApiError } = require("../dist/index.cjs.js");

assert.strictEqual(typeof Captivate, "function");
assert.strictEqual(typeof CaptivateApiError, "function");
assert.strictEqual(Captivate.CaptivateApiError, CaptivateApiError);
const client = new Captivate("user", "key");
assert.strictEqual(typeof client.uploadArtwork, "function");
assert.ok(new CaptivateApiError("x", { method: "m", endpoint: "GET /" }) instanceof Error);
console.log("CJS build OK");

// Resolve through package.json "exports", as consumers do.
assert.strictEqual(require("captivate-fm-api-client"), Captivate);
console.log("CJS exports map OK");
