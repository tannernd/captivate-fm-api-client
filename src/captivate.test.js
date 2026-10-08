const Captivate = require("./captivate");
const { CaptivateApiError } = require("./errors");
const axios = require("axios");
const fs = require("fs");
const { Readable, Writable } = require("stream");

jest.mock("axios");
jest.mock("fs");

function ok(data, status = 200) {
  return { status, data };
}

function httpError(status, data = { message: "nope" }) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });
}

function networkError() {
  return Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
}

// Returns the multipart body of the nth axios call as text (Buffer/string parts only).
function formText(callIndex = 0) {
  return axios.mock.calls[callIndex][0].data.getBuffer().toString("utf8");
}

// Pipes a multipart body (including stream parts) and returns it as text.
function drainForm(form) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    sink.on("finish", () => resolve(Buffer.concat(chunks).toString("utf8")));
    form.on("error", reject);
    form.pipe(sink);
  });
}

async function expectApiError(promise, { status, endpoint, method }) {
  let error;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(CaptivateApiError);
  expect(error.status).toBe(status);
  if (endpoint) expect(error.endpoint).toBe(endpoint);
  if (method) expect(error.method).toBe(method);
  return error;
}

const validEpisode = {
  showId: "show1",
  title: "Episode Title",
  mediaId: "media123",
  publishDate: "2026-11-01 06:00:00",
  episodeNumber: 12,
};

describe("Captivate API Client", () => {
  let client;
  let consoleSpies;

  beforeEach(() => {
    client = new Captivate("testUser", "testKey");
    client.token = "fakeToken";
    consoleSpies = ["log", "error", "warn", "info"].map((name) =>
      jest.spyOn(console, name).mockImplementation(() => {})
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
    jest.resetAllMocks();
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe("constructor options", () => {
    test("defaults keep the two-argument form working", async () => {
      axios.mockResolvedValue(ok({ shows: [] }));
      await client.getUserShows();
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.captivate.fm/users/testUser/shows",
          timeout: 60000,
        })
      );
    });

    test("apiBase, timeoutMs and uploadTimeoutMs are applied", async () => {
      client = new Captivate("u", "k", {
        apiBase: "https://example.test/",
        timeoutMs: 1234,
        uploadTimeoutMs: 5678,
      });
      client.token = "t";
      axios.mockResolvedValueOnce(ok({ shows: [] }));
      axios.mockResolvedValueOnce(ok({ media: { id: "m1" } }));

      await client.getUserShows();
      await client.uploadEpisode(Buffer.from("abc"), "show1", { filename: "a.mp3" });

      expect(axios.mock.calls[0][0]).toMatchObject({ url: "https://example.test/users/u/shows", timeout: 1234 });
      expect(axios.mock.calls[1][0]).toMatchObject({ url: "https://example.test/shows/show1/media", timeout: 5678 });
    });
  });

  // ─── Authentication ─────────────────────────────────────────────────

  describe("authentication", () => {
    test("authenticateUser sets and returns the token", async () => {
      client.token = "";
      axios.mockResolvedValue(ok({ user: { token: "newToken123" } }));

      const token = await client.authenticateUser();

      expect(token).toBe("newToken123");
      expect(client.token).toBe("newToken123");
      const config = axios.mock.calls[0][0];
      expect(config.url).toBe("https://api.captivate.fm/authenticate/token");
      expect(config.headers.Authorization).toBeUndefined();
      expect(config.timeout).toBe(60000);
    });

    test("authenticateUser throws CaptivateApiError on HTTP error", async () => {
      axios.mockRejectedValue(httpError(403));
      await expectApiError(client.authenticateUser(), {
        status: 403,
        endpoint: "POST /authenticate/token",
        method: "authenticateUser",
      });
    });

    test("authenticateUser throws when the response has no token", async () => {
      axios.mockResolvedValue(ok({ user: {} }));
      const error = await expectApiError(client.authenticateUser(), { status: 200 });
      expect(error.message).toMatch(/user\.token/);
    });

    test("authenticateUser throws TypeError without credentials", async () => {
      client = new Captivate(undefined, "key");
      await expect(client.authenticateUser()).rejects.toThrow(TypeError);
      expect(axios).not.toHaveBeenCalled();
    });

    test("calls without a token authenticate first", async () => {
      client.token = "";
      axios.mockResolvedValueOnce(ok({ user: { token: "lazyToken" } }));
      axios.mockResolvedValueOnce(ok({ shows: ["s"] }));

      await expect(client.getUserShows()).resolves.toEqual(["s"]);

      expect(axios.mock.calls[0][0].url).toContain("/authenticate/token");
      expect(axios.mock.calls[1][0].headers.Authorization).toBe("Bearer lazyToken");
    });

    test("concurrent calls share one authentication request", async () => {
      client.token = "";
      axios.mockImplementation(async (config) =>
        config.url.endsWith("/authenticate/token")
          ? ok({ user: { token: "shared" } })
          : ok({ shows: [] })
      );

      await Promise.all([client.getUserShows(), client.getUserShows(), client.getUserShows()]);

      const authCalls = axios.mock.calls.filter(([c]) => c.url.endsWith("/authenticate/token"));
      expect(authCalls).toHaveLength(1);
    });

    test("401 re-authenticates and retries once, then succeeds", async () => {
      axios.mockRejectedValueOnce(httpError(401));
      axios.mockResolvedValueOnce(ok({ user: { token: "fresh" } }));
      axios.mockResolvedValueOnce(ok({ episodes: [], count: 0 }));

      await expect(client.listEpisodes("show1")).resolves.toEqual({ episodes: [], count: 0 });

      expect(axios).toHaveBeenCalledTimes(3);
      expect(axios.mock.calls[0][0].headers.Authorization).toBe("Bearer fakeToken");
      expect(axios.mock.calls[2][0].headers.Authorization).toBe("Bearer fresh");
    });

    test("401 re-authenticates, retries once, and throws on a second 401", async () => {
      axios.mockRejectedValueOnce(httpError(401));
      axios.mockResolvedValueOnce(ok({ user: { token: "fresh" } }));
      axios.mockRejectedValueOnce(httpError(401, { message: "still no" }));

      const error = await expectApiError(client.listEpisodes("show1"), {
        status: 401,
        endpoint: "GET /shows/show1/episodes",
        method: "listEpisodes",
      });
      expect(error.responseBody).toContain("still no");
      expect(axios).toHaveBeenCalledTimes(3);
    });

    test("401 retry rebuilds a Buffer upload body", async () => {
      axios.mockRejectedValueOnce(httpError(401));
      axios.mockResolvedValueOnce(ok({ user: { token: "fresh" } }));
      axios.mockResolvedValueOnce(ok({ media: { id: "m1" } }));

      await expect(
        client.uploadEpisode(Buffer.from("audio"), "show1", { filename: "ep.mp3" })
      ).resolves.toBe("m1");
      expect(axios.mock.calls[2][0].data).not.toBe(axios.mock.calls[0][0].data);
      expect(formText(2)).toContain("audio");
    });

    test("401 on a stream upload re-authenticates but does not replay the stream", async () => {
      axios.mockRejectedValueOnce(httpError(401));
      axios.mockResolvedValueOnce(ok({ user: { token: "fresh" } }));

      const error = await expectApiError(
        client.uploadEpisode(Readable.from(["audio"]), "show1", { filename: "ep.mp3" }),
        { status: 401, endpoint: "POST /shows/show1/media" }
      );
      expect(error.message).toMatch(/cannot be replayed/);
      expect(client.token).toBe("fresh");
      expect(axios).toHaveBeenCalledTimes(2);
    });

    test("401 then failed re-authentication throws the auth error", async () => {
      axios.mockRejectedValueOnce(httpError(401));
      axios.mockRejectedValueOnce(httpError(500));
      await expectApiError(client.getUserShows(), { status: 500, method: "authenticateUser" });
    });
  });

  // ─── Error details ──────────────────────────────────────────────────

  describe("CaptivateApiError", () => {
    test("network errors have status null and keep the cause", async () => {
      const cause = networkError();
      axios.mockRejectedValue(cause);
      const error = await expectApiError(client.getUserShows(), {
        status: null,
        endpoint: "GET /users/testUser/shows",
      });
      expect(error.cause).toBe(cause);
      expect(error.message).toMatch(/ECONNRESET/);
    });

    test("passes an abort signal and reports a hard-deadline timeout", async () => {
      client = new Captivate("u", "k", { timeoutMs: 20 });
      client.token = "t";
      axios.mockImplementation(
        (config) =>
          new Promise((_, reject) => {
            config.signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("canceled"), { code: "ERR_CANCELED" }))
            );
          })
      );

      const error = await expectApiError(client.getUserShows(), {
        status: null,
        endpoint: "GET /users/u/shows",
      });
      expect(error.message).toMatch(/timed out after 20ms/);
      expect(axios.mock.calls[0][0].timeout).toBe(20);
    });

    test("responseBody is truncated to about 2 KB", async () => {
      axios.mockRejectedValue(httpError(500, "x".repeat(10000)));
      const error = await expectApiError(client.getUserShows(), { status: 500 });
      expect(error.responseBody.length).toBeLessThan(2100);
      expect(error.responseBody).toMatch(/truncated/);
    });

    test("success: false on HTTP 200 throws", async () => {
      axios.mockResolvedValue(ok({ success: false, errors: ["bad"], errfor: {} }));
      const error = await expectApiError(client.createEpisode(validEpisode), {
        status: 200,
        endpoint: "POST /episodes",
      });
      expect(error.responseBody).toContain("bad");
    });

    test("is exported from the class", () => {
      expect(Captivate.CaptivateApiError).toBe(CaptivateApiError);
      expect(new CaptivateApiError("m", { method: "x", endpoint: "GET /" })).toBeInstanceOf(Error);
    });
  });

  // ─── Shows ──────────────────────────────────────────────────────────

  describe("getUserShows", () => {
    test("returns shows and sends the Authorization header", async () => {
      axios.mockResolvedValue(ok({ shows: ["show1", "show2"] }));

      await expect(client.getUserShows()).resolves.toEqual(["show1", "show2"]);
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "get",
          url: expect.stringContaining("/users/testUser/shows"),
          headers: expect.objectContaining({ Authorization: "Bearer fakeToken" }),
        })
      );
    });

    test("throws when the response has no shows array", async () => {
      axios.mockResolvedValue(ok({ success: true }));
      await expectApiError(client.getUserShows(), { status: 200, method: "getUserShows" });
    });
  });

  // ─── Media upload ───────────────────────────────────────────────────

  describe("uploadEpisode", () => {
    test("uploads from a file path and returns the media ID", async () => {
      fs.createReadStream.mockReturnValue("mockStream");
      axios.mockResolvedValue(ok({ success: true, media: { id: "media123" } }));

      await expect(client.uploadEpisode("dir/mock.mp3", "showId")).resolves.toBe("media123");
      expect(fs.createReadStream).toHaveBeenCalledWith("dir/mock.mp3");
      const text = formText();
      expect(text).toContain('filename="mock.mp3"');
      expect(text).toContain("Content-Type: audio/mpeg");
      expect(axios.mock.calls[0][0]).toMatchObject({ url: expect.stringContaining("/shows/showId/media"), timeout: 600000 });
    });

    test("uploads from a Buffer with filename and default content type", async () => {
      axios.mockResolvedValue(ok({ media: { id: "m1" } }));

      await expect(
        client.uploadEpisode(Buffer.from("ID3audio"), "show1", { filename: "ep12.mp3" })
      ).resolves.toBe("m1");
      const text = formText();
      expect(text).toContain('name="file"; filename="ep12.mp3"');
      expect(text).toContain("Content-Type: audio/mpeg");
      expect(text).toContain("ID3audio");
      expect(fs.createReadStream).not.toHaveBeenCalled();
    });

    test("uploads from a Readable with a custom content type", async () => {
      axios.mockResolvedValue(ok({ media: { id: "m2" } }));
      const stream = Readable.from(["chunk"]);

      await expect(
        client.uploadEpisode(stream, "show1", { filename: "ep.m4a", contentType: "audio/mp4" })
      ).resolves.toBe("m2");
      const form = axios.mock.calls[0][0].data;
      expect(form.getHeaders()["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      const text = await drainForm(form);
      expect(text).toContain('filename="ep.m4a"');
      expect(text).toContain("Content-Type: audio/mp4");
      expect(text).toContain("chunk");
    });

    test.each([
      ["Buffer", () => Buffer.from("x")],
      ["Readable", () => Readable.from(["x"])],
    ])("%s input without options.filename throws TypeError before any request", async (_, makeInput) => {
      await expect(client.uploadEpisode(makeInput(), "show1")).rejects.toThrow(/options\.filename is required/);
      await expect(client.uploadEpisode(makeInput(), "show1", {})).rejects.toThrow(TypeError);
      expect(axios).not.toHaveBeenCalled();
    });

    test("rejects unsupported input types and missing showId", async () => {
      await expect(client.uploadEpisode(42, "show1")).rejects.toThrow(TypeError);
      await expect(client.uploadEpisode("a.mp3")).rejects.toThrow(/showId/);
      expect(axios).not.toHaveBeenCalled();
    });

    test("throws when the response has no media ID", async () => {
      axios.mockResolvedValue(ok({ success: true }));
      const error = await expectApiError(
        client.uploadEpisode(Buffer.from("x"), "show1", { filename: "a.mp3" }),
        { status: 200, endpoint: "POST /shows/show1/media", method: "uploadEpisode" }
      );
      expect(error.message).toMatch(/media\.id/);
    });
  });

  // ─── Artwork ────────────────────────────────────────────────────────

  describe("artwork", () => {
    test("createShowArtwork uploads from a path and returns the raw response", async () => {
      fs.createReadStream.mockReturnValue("mockStream");
      axios.mockResolvedValue(ok({ success: true }));

      await expect(client.createShowArtwork("art/cover.png", "showId")).resolves.toEqual({ success: true });
      expect(formText()).toContain("Content-Type: image/png");
      expect(axios.mock.calls[0][0]).toMatchObject({ url: expect.stringContaining("/shows/showId/artwork"), timeout: 600000 });
    });

    test.each([
      ["artwork.artwork_url", { success: true, artwork: { artwork_url: "https://cdn/a.jpg" } }],
      ["artwork_url", { success: true, artwork_url: "https://cdn/a.jpg" }],
    ])("uploadArtwork returns { url, raw } when the URL is at %s", async (_, data) => {
      axios.mockResolvedValue(ok(data));
      await expect(
        client.uploadArtwork(Buffer.from("jpg"), "show1", { filename: "cover.jpeg" })
      ).resolves.toEqual({ url: "https://cdn/a.jpg", raw: data });
      expect(formText()).toContain("Content-Type: image/jpeg");
    });

    test("uploadArtwork throws when the response has no artwork URL", async () => {
      axios.mockResolvedValue(ok({ success: true }));
      await expectApiError(
        client.uploadArtwork(Buffer.from("jpg"), "show1", { filename: "c.jpg" }),
        { status: 200, endpoint: "POST /shows/show1/artwork", method: "uploadArtwork" }
      );
    });

    test("uploadArtwork requires a filename for stream input", async () => {
      await expect(client.uploadArtwork(Readable.from(["x"]), "show1")).rejects.toThrow(TypeError);
      expect(axios).not.toHaveBeenCalled();
    });
  });

  // ─── Episodes ───────────────────────────────────────────────────────

  describe("listEpisodes / listScheduledEpisodes / getEpisode", () => {
    test("listEpisodes returns the response data", async () => {
      axios.mockResolvedValue(ok({ episodes: [], count: 0 }));
      await expect(client.listEpisodes("show123")).resolves.toEqual({ episodes: [], count: 0 });
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "get",
          url: expect.stringContaining("/shows/show123/episodes"),
          headers: expect.objectContaining({ Authorization: "Bearer fakeToken" }),
        })
      );
    });

    test("listEpisodes throws when the response has no episodes array", async () => {
      axios.mockResolvedValue(ok({}));
      await expectApiError(client.listEpisodes("s"), { status: 200, method: "listEpisodes" });
    });

    test("listScheduledEpisodes calls the scheduled endpoint", async () => {
      axios.mockResolvedValue(ok({ episodes: [{ id: "e" }], count: 1 }));
      await expect(client.listScheduledEpisodes("s")).resolves.toEqual({ episodes: [{ id: "e" }], count: 1 });
      expect(axios.mock.calls[0][0].url).toBe("https://api.captivate.fm/shows/s/episodes/scheduled");
    });

    test("getEpisode returns the episode object", async () => {
      axios.mockResolvedValue(ok({ success: true, episode: { id: "ep1" } }));
      await expect(client.getEpisode("ep1")).resolves.toEqual({ id: "ep1" });
      expect(axios.mock.calls[0][0].url).toBe("https://api.captivate.fm/episodes/ep1");
    });

    test("getEpisode throws when the response has no episode", async () => {
      axios.mockResolvedValue(ok({ success: true }));
      await expectApiError(client.getEpisode("ep1"), { status: 200, endpoint: "GET /episodes/ep1" });
    });

    test("getEpisode requires an ID", async () => {
      await expect(client.getEpisode()).rejects.toThrow(TypeError);
    });
  });

  describe("findEpisodeByNumber", () => {
    function mockListings(all, scheduled) {
      axios.mockImplementation(async (config) =>
        config.url.endsWith("/episodes/scheduled") ? ok(scheduled) : ok(all)
      );
    }

    test("returns the episode from the main list", async () => {
      mockListings(
        { count: 2, episodes: [{ id: "a", episode_number: 11 }, { id: "b", episode_number: 12 }] },
        { count: 0, episodes: [] }
      );
      await expect(client.findEpisodeByNumber("show1", 12)).resolves.toEqual({ id: "b", episode_number: 12 });
      expect(axios).toHaveBeenCalledTimes(1);
    });

    test("matches string and number episode numbers", async () => {
      mockListings({ count: 1, episodes: [{ id: "a", episode_number: "7" }] }, { count: 0, episodes: [] });
      await expect(client.findEpisodeByNumber("show1", 7)).resolves.toMatchObject({ id: "a" });
    });

    test("falls back to the scheduled list", async () => {
      mockListings(
        { count: 1, episodes: [{ id: "a", episode_number: 11 }] },
        { count: 1, episodes: [{ id: "s", episode_number: 12 }] }
      );
      await expect(client.findEpisodeByNumber("show1", 12)).resolves.toEqual({ id: "s", episode_number: 12 });
    });

    test("returns null when no listing has the number", async () => {
      mockListings(
        { count: 1, episodes: [{ id: "a", episode_number: 11 }] },
        { count: 0, episodes: [] }
      );
      await expect(client.findEpisodeByNumber("show1", 99)).resolves.toBeNull();
      expect(axios).toHaveBeenCalledTimes(2);
    });

    test("throws instead of returning null when a listing is incomplete", async () => {
      mockListings({ count: 150, episodes: [{ id: "a", episode_number: 1 }] }, { count: 0, episodes: [] });
      const error = await expectApiError(client.findEpisodeByNumber("show1", 99), {
        status: null,
        method: "findEpisodeByNumber",
      });
      expect(error.message).toMatch(/1 of 150/);
    });

    test("propagates listing errors", async () => {
      axios.mockRejectedValue(httpError(503));
      await expectApiError(client.findEpisodeByNumber("show1", 1), {
        status: 503,
        method: "listEpisodes",
      });
    });

    test("requires showId and episodeNumber", async () => {
      await expect(client.findEpisodeByNumber("show1")).rejects.toThrow(/episodeNumber/);
      await expect(client.findEpisodeByNumber(undefined, 1)).rejects.toThrow(/showId/);
    });
  });

  describe("createEpisode", () => {
    test("creates an episode and returns the response", async () => {
      const data = { success: true, errors: [], errfor: {}, record: { id: "ep1" } };
      axios.mockResolvedValue(ok(data));

      await expect(
        client.createEpisode({ ...validEpisode, showNotes: "Notes", summary: "Sum", episodeType: "full" })
      ).resolves.toEqual(data);

      const config = axios.mock.calls[0][0];
      expect(config).toMatchObject({ method: "post", url: "https://api.captivate.fm/episodes" });
      const text = formText();
      for (const [name, value] of [
        ["shows_id", "show1"],
        ["title", "Episode Title"],
        ["itunes_title", "Episode Title"],
        ["media_id", "media123"],
        ["date", "2026-11-01 06:00:00"],
        ["episode_number", "12"],
        ["shownotes", "Notes"],
        ["episode_type", "full"],
      ]) {
        expect(text).toContain(`name="${name}"\r\n\r\n${value}\r\n`);
      }
    });

    test.each(["showId", "title", "mediaId", "publishDate", "episodeNumber"])(
      "throws TypeError naming missing %s",
      async (field) => {
        const params = { ...validEpisode };
        delete params[field];
        await expect(client.createEpisode(params)).rejects.toThrow(new RegExp(`"${field}"`));
        await expect(client.createEpisode(params)).rejects.toThrow(TypeError);
        expect(axios).not.toHaveBeenCalled();
      }
    );

    test("throws TypeError without a params object", async () => {
      await expect(client.createEpisode()).rejects.toThrow(TypeError);
    });

    test.each(["2026-11-01", "2026-11-01T06:00:00", "2026-13-01 06:00:00", "2026-11-01 24:00:00", "11/01/2026 06:00:00"])(
      "rejects malformed publishDate %s",
      async (publishDate) => {
        await expect(client.createEpisode({ ...validEpisode, publishDate })).rejects.toThrow(/YYYY-MM-DD HH:mm:ss/);
        expect(axios).not.toHaveBeenCalled();
      }
    );

    test("sends false booleans and omits null/undefined fields", async () => {
      axios.mockResolvedValue(ok({ success: true, record: { id: "ep1" } }));

      await client.createEpisode({
        ...validEpisode,
        explicit: false,
        itunesBlock: false,
        episodeSeason: 0,
        subtitle: null,
        author: undefined,
      });

      const text = formText();
      expect(text).toContain('name="explicit"\r\n\r\nclean\r\n');
      expect(text).toContain('name="itunes_block"\r\n\r\nfalse\r\n');
      expect(text).toContain('name="episode_season"\r\n\r\n0\r\n');
      expect(text).not.toContain('name="itunes_subtitle"');
      expect(text).not.toContain('name="author"');
      expect(text).not.toContain('name="status"');
    });

    test("serializes explicit: true as \"explicit\" and passes strings through", async () => {
      axios.mockResolvedValue(ok({ success: true, record: { id: "ep1" } }));
      await client.createEpisode({ ...validEpisode, explicit: true, itunesBlock: true, status: "Draft" });
      const text = formText();
      expect(text).toContain('name="explicit"\r\n\r\nexplicit\r\n');
      expect(text).toContain('name="itunes_block"\r\n\r\ntrue\r\n');
      expect(text).toContain('name="status"\r\n\r\nDraft\r\n');
    });

    test("throws when the response has no record.id", async () => {
      axios.mockResolvedValue(ok({ success: true }));
      await expectApiError(client.createEpisode(validEpisode), {
        status: 200,
        endpoint: "POST /episodes",
        method: "createEpisode",
      });
    });
  });

  describe("updateEpisode", () => {
    test("PUTs only the given fields", async () => {
      axios.mockResolvedValue(ok({ success: true, episode: [{ id: "ep1" }] }));

      await expect(
        client.updateEpisode("ep1", { title: "New", publishDate: "2026-12-01 06:00:00", explicit: false })
      ).resolves.toEqual({ success: true, episode: [{ id: "ep1" }] });

      expect(axios.mock.calls[0][0]).toMatchObject({ method: "put", url: "https://api.captivate.fm/episodes/ep1" });
      const text = formText();
      expect(text).toContain('name="title"\r\n\r\nNew\r\n');
      expect(text).toContain('name="date"\r\n\r\n2026-12-01 06:00:00\r\n');
      expect(text).toContain('name="explicit"\r\n\r\nclean\r\n');
      expect(text).not.toContain('name="media_id"');
    });

    test("validates arguments before any request", async () => {
      await expect(client.updateEpisode(undefined, { title: "x" })).rejects.toThrow(/episodeId/);
      await expect(client.updateEpisode("ep1", {})).rejects.toThrow(TypeError);
      await expect(client.updateEpisode("ep1", { publishDate: "2026-12-01" })).rejects.toThrow(TypeError);
      expect(axios).not.toHaveBeenCalled();
    });
  });

  // ─── Error path for every request method ────────────────────────────

  describe.each([
    ["getUserShows", (c) => c.getUserShows(), "GET /users/testUser/shows"],
    ["listEpisodes", (c) => c.listEpisodes("s1"), "GET /shows/s1/episodes"],
    ["listScheduledEpisodes", (c) => c.listScheduledEpisodes("s1"), "GET /shows/s1/episodes/scheduled"],
    ["getEpisode", (c) => c.getEpisode("e1"), "GET /episodes/e1"],
    ["uploadEpisode", (c) => c.uploadEpisode(Buffer.from("x"), "s1", { filename: "a.mp3" }), "POST /shows/s1/media"],
    ["createShowArtwork", (c) => c.createShowArtwork(Buffer.from("x"), "s1", { filename: "a.png" }), "POST /shows/s1/artwork"],
    ["uploadArtwork", (c) => c.uploadArtwork(Buffer.from("x"), "s1", { filename: "a.png" }), "POST /shows/s1/artwork"],
    ["createEpisode", (c) => c.createEpisode(validEpisode), "POST /episodes"],
    ["updateEpisode", (c) => c.updateEpisode("e1", { title: "t" }), "PUT /episodes/e1"],
    ["getAnalyticsOverview", (c) => c.getAnalyticsOverview("s1", "2026-01-01", "2026-01-31"), "GET /insights/s1/overview"],
    ["getEpisodeAnalyticsOverview", (c) => c.getEpisodeAnalyticsOverview("s1", "e1", "2026-01-01", "2026-01-31"), "GET /insights/s1/overview/e1"],
    ["getAnalyticsAverages", (c) => c.getAnalyticsAverages("s1"), "GET /insights/s1/averages"],
    ["getAnalyticsTotal", (c) => c.getAnalyticsTotal("s1"), "GET /insights/s1/total"],
    ["getEpisodeAnalyticsTotal", (c) => c.getEpisodeAnalyticsTotal("s1", "e1"), "GET /insights/s1/total/e1"],
    ["getAnalyticsMonthly", (c) => c.getAnalyticsMonthly("s1"), "GET /insights/s1/monthly"],
    ["getEpisodeAnalyticsMonthly", (c) => c.getEpisodeAnalyticsMonthly("s1", "e1"), "GET /insights/s1/monthly/e1"],
    ["getAnalyticsRange", (c) => c.getAnalyticsRange("s1", { start: "a", end: "b" }), "POST /insights/s1/range"],
    ["getEpisodeAnalyticsRange", (c) => c.getEpisodeAnalyticsRange("s1", "e1", { start: "a", end: "b" }), "POST /insights/s1/range/e1"],
    ["getAnalyticsComparison", (c) => c.getAnalyticsComparison("s1", [{ id: "e1" }]), "POST /insights/s1/compare"],
    ["getWebPlayerAnalytics", (c) => c.getWebPlayerAnalytics("s1", "e1", { dateRange: {} }), "POST /insights/s1/web-player/e1"],
  ])("%s error path", (method, call, endpoint) => {
    test("HTTP error rejects with CaptivateApiError carrying status and endpoint", async () => {
      axios.mockRejectedValue(httpError(500, { error: "boom" }));
      const error = await expectApiError(call(client), { status: 500, endpoint, method });
      expect(error.responseBody).toContain("boom");
    });

    test("network error rejects with status null", async () => {
      axios.mockRejectedValue(networkError());
      await expectApiError(call(client), { status: null, endpoint, method });
    });
  });

  // ─── Analytics / Insights ───────────────────────────────────────────

  test("getAnalyticsOverview calls correct endpoint with params", async () => {
    axios.mockResolvedValue(ok({ overview: "data" }));

    const result = await client.getAnalyticsOverview("show1", "2026-01-01", "2026-01-31");

    expect(result).toEqual({ overview: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        url: expect.stringContaining("/insights/show1/overview"),
        headers: expect.objectContaining({ Authorization: "Bearer fakeToken" }),
        params: { start: "2026-01-01", end: "2026-01-31", includeTopEpisodes: true },
      })
    );
  });

  test("getEpisodeAnalyticsOverview calls correct endpoint", async () => {
    axios.mockResolvedValue(ok({ episode_overview: "data" }));

    const result = await client.getEpisodeAnalyticsOverview("show1", "ep1", "2026-01-01", "2026-01-31");

    expect(result).toEqual({ episode_overview: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/overview/ep1"),
      })
    );
  });

  test("getAnalyticsAverages calls correct endpoint with interval", async () => {
    axios.mockResolvedValue(ok({ averages: "data" }));

    const result = await client.getAnalyticsAverages("show1", 14);

    expect(result).toEqual({ averages: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/averages"),
        params: { intervalDays: 14 },
      })
    );
  });

  test("getAnalyticsTotal returns all-time total", async () => {
    axios.mockResolvedValue(ok({ total: 50000 }));

    const result = await client.getAnalyticsTotal("show1");

    expect(result).toEqual({ total: 50000 });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/total"),
      })
    );
  });

  test("getEpisodeAnalyticsTotal returns episode total", async () => {
    axios.mockResolvedValue(ok({ total: 1200 }));

    const result = await client.getEpisodeAnalyticsTotal("show1", "ep1");

    expect(result).toEqual({ total: 1200 });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/total/ep1"),
      })
    );
  });

  test("getAnalyticsMonthly returns monthly data", async () => {
    axios.mockResolvedValue(ok({ monthly: { "2026-01": 100 } }));

    const result = await client.getAnalyticsMonthly("show1");

    expect(result).toEqual({ monthly: { "2026-01": 100 } });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/monthly"),
      })
    );
  });

  test("getEpisodeAnalyticsMonthly returns episode monthly data", async () => {
    axios.mockResolvedValue(ok({ monthly: { "2026-01": 50 } }));

    const result = await client.getEpisodeAnalyticsMonthly("show1", "ep1");

    expect(result).toEqual({ monthly: { "2026-01": 50 } });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/monthly/ep1"),
      })
    );
  });

  test("getAnalyticsRange posts range query", async () => {
    axios.mockResolvedValue(ok({ range: "data" }));

    const params = { start: "2026-01-01", end: "2026-01-31", interval: "1d" };
    const result = await client.getAnalyticsRange("show1", params);

    expect(result).toEqual({ range: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        url: expect.stringContaining("/insights/show1/range"),
        data: params,
      })
    );
  });

  test("getEpisodeAnalyticsRange posts episode range query", async () => {
    axios.mockResolvedValue(ok({ range: "episode_data" }));

    const params = { start: "2026-01-01", end: "2026-01-31" };
    const result = await client.getEpisodeAnalyticsRange("show1", "ep1", params);

    expect(result).toEqual({ range: "episode_data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/range/ep1"),
      })
    );
  });

  test("getAnalyticsComparison posts episodes array", async () => {
    axios.mockResolvedValue(ok({ comparison: "data" }));

    const episodes = [{ id: "ep1", title: "Ep 1", published_date: "2026-01-01" }];
    const result = await client.getAnalyticsComparison("show1", episodes);

    expect(result).toEqual({ comparison: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        url: expect.stringContaining("/insights/show1/compare"),
        data: episodes,
      })
    );
  });

  test("getWebPlayerAnalytics posts web player query", async () => {
    axios.mockResolvedValue(ok({ webPlayer: "data" }));

    const params = { dateRange: { gte: "2026-01-01", lte: "2026-01-31" }, timezone: "America/New_York" };
    const result = await client.getWebPlayerAnalytics("show1", "ep1", params);

    expect(result).toEqual({ webPlayer: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        url: expect.stringContaining("/insights/show1/web-player/ep1"),
      })
    );
  });

  test("analytics methods validate required arguments", async () => {
    await expect(client.getAnalyticsOverview("show1")).rejects.toThrow(/start/);
    await expect(client.getAnalyticsRange("show1")).rejects.toThrow(/params/);
    expect(axios).not.toHaveBeenCalled();
  });
});
