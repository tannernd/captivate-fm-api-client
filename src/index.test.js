// Imports through the package entry point with the exact (lowercase) path the
// build uses, so a case mismatch fails on case-sensitive filesystems.
const Captivate = require("./index");
const { CaptivateApiError } = require("./index");

describe("src/index.js", () => {
  test("exports the Captivate class", () => {
    expect(typeof Captivate).toBe("function");
    const client = new Captivate("user", "key");
    expect(typeof client.uploadEpisode).toBe("function");
    expect(typeof client.findEpisodeByNumber).toBe("function");
  });

  test("exports CaptivateApiError as a named export and static property", () => {
    expect(typeof CaptivateApiError).toBe("function");
    expect(Captivate.CaptivateApiError).toBe(CaptivateApiError);
    const error = new CaptivateApiError("failed", { method: "m", endpoint: "GET /x", status: 500 });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CaptivateApiError");
  });

  test("every require in src uses the on-disk file name casing", () => {
    const fs = require("fs");
    const path = require("path");
    const files = new Set(fs.readdirSync(__dirname));
    for (const file of files) {
      if (!file.endsWith(".js") && !file.endsWith(".mjs")) continue;
      const source = fs.readFileSync(path.join(__dirname, file), "utf8");
      for (const [, spec] of source.matchAll(/(?:require\(|from\s+)["'](\.\/[^"']+)["']/g)) {
        const base = path.basename(spec);
        const candidates = [base, `${base}.js`, `${base}.mjs`];
        expect(candidates.some((name) => files.has(name))).toBe(true);
      }
    }
  });
});
