// Loads the built ESM bundle and checks the public surface.
import assert from "assert";
import Captivate, { CaptivateApiError } from "../dist/index.esm.mjs";

assert.strictEqual(typeof Captivate, "function");
assert.strictEqual(typeof CaptivateApiError, "function");
assert.strictEqual(Captivate.CaptivateApiError, CaptivateApiError);
const client = new Captivate("user", "key");
assert.strictEqual(typeof client.findEpisodeByNumber, "function");
console.log("ESM build OK");

// Resolve through package.json "exports", as consumers do.
const pkg = await import("captivate-fm-api-client");
assert.strictEqual(pkg.default, Captivate);
assert.strictEqual(pkg.CaptivateApiError, CaptivateApiError);
console.log("ESM exports map OK");
