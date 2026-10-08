# Captivate API Client

A Node.js client for the [Captivate.fm](https://www.captivate.fm) API. It can authenticate, upload media and artwork from disk or from memory, list, find, create and update episodes, and read analytics. It has an async interface and every failure throws.

---

## 🚀 Features

- 🔐 Lazy authentication, with automatic re-authentication on `401`
- 📤 Upload media and artwork from a file path, a `Buffer`, or a `stream.Readable`
- 🎙️ Create, update, fetch, and find episodes (idempotency-friendly `findEpisodeByNumber`)
- 📺 List shows, episodes, and scheduled episodes
- 📊 Full Analytics / Insights API support
- 💥 Every failure throws a typed `CaptivateApiError`; the library never logs to the console
- ⏱️ Configurable request and upload timeouts
- 🟦 TypeScript declarations included; CJS and ESM builds

---

## 📦 Installation

```bash
npm install captivate-fm-api-client
```

---

## 🔧 Requirements

- Node.js v18+
- Captivate.fm API access (user ID & API key)

---

## 🛠️ Usage

```js
const Captivate = require("captivate-fm-api-client");
const { CaptivateApiError } = Captivate;
// or: import Captivate, { CaptivateApiError } from "captivate-fm-api-client";

const captivate = new Captivate(
  process.env.CAPTIVATE_USER_ID,
  process.env.CAPTIVATE_API_KEY,
  { timeoutMs: 60000, uploadTimeoutMs: 600000 } // optional
);

async function publish(showId, audioBuffer) {
  // No need to call authenticateUser() first: the first request does it.
  const existing = await captivate.findEpisodeByNumber(showId, 12);
  if (existing) return existing; // safe to retry

  const mediaId = await captivate.uploadEpisode(audioBuffer, showId, {
    filename: "episode-12.mp3",
  });

  const { record } = await captivate.createEpisode({
    showId,
    title: "Episode Title",
    mediaId,
    publishDate: "2026-11-01 06:00:00", // show's time zone, see below
    episodeNumber: 12,
    showNotes: "<p>Show notes</p>",
    summary: "Short summary of the episode.",
    episodeType: "full",
    explicit: false,
  });
  return record;
}

publish("your-show-id", someBuffer).catch((error) => {
  if (error instanceof CaptivateApiError) {
    // error.method, error.endpoint, error.status, error.responseBody, error.cause
  }
  throw error;
});
```

---

## 💥 Errors

Every method returns a promise that resolves to the documented value or rejects. No method resolves to `undefined` because a request failed.

- **`TypeError`**: a required argument is missing or malformed, such as a missing `createEpisode` field, a bad `publishDate` format, or a Buffer upload without a `filename`. It is thrown before any request is made.
- **`CaptivateApiError`**: a request failed. That covers HTTP errors, network errors and timeouts, a response with `success: false`, and a response that lacks a field the SDK needs (for example, an upload with no media ID). It has these properties:

| Property       | Description                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `method`       | SDK method name, e.g. `"uploadEpisode"`                                |
| `endpoint`     | HTTP method and path, e.g. `"POST /shows/123/media"`                   |
| `status`       | HTTP status, or `null` if no response was received                     |
| `responseBody` | Response body as a string, truncated to about 2 KB                     |
| `cause`        | The original error (e.g. the axios error)                              |

### Authentication and retries

- Any call made without a token authenticates first. Concurrent calls share a single authentication request.
- On a `401`, the client re-authenticates once and retries the request once. A second failure throws.
- A `stream.Readable` upload cannot be resent. On a `401` the client re-authenticates and then throws, so you can retry with a fresh stream. File paths and Buffers are retried automatically.
- The SDK does **not** retry `5xx`, `429` or network errors. Retrying a non-idempotent call such as `createEpisode` could create a duplicate, so retries are left to the caller. Use `findEpisodeByNumber` to make your retries safe.

---

## 🗓️ Publish dates and status

`createEpisode` and `updateEpisode` send `publishDate` as Captivate's `date` field.

- **Format:** `YYYY-MM-DD HH:mm:ss` (e.g. `2026-11-01 06:00:00`). Any other format throws a `TypeError`.
- **Time zone:** Captivate interprets the value in the **show's time zone**, which is the show's `time_zone` setting in Captivate (see `getUserShows()`). It does not use UTC. The SDK does no time-zone conversion. For example, if your show is set to `America/Denver`, pass Mountain Time wall-clock values.
- **Scheduling is driven by the date, not by `status`:**

| `status`  | `publishDate`      | Result                                                        |
| --------- | ------------------ | ------------------------------------------------------------- |
| omitted   | in the future      | Episode is **scheduled** for that time                        |
| omitted   | now or in the past | Episode goes **live immediately** (requires attached media)   |
| `"Draft"` | any                | Episode is saved as a **draft**                               |

Captivate's docs name only `"Draft"` as a status value to send. They warn against forcing a published status when the date doesn't match, so leave `status` out unless you want a draft.

---

## 📚 API Reference

### `new Captivate(userId, apiKey, options?)`

Creates a new client instance.

- `options.apiBase` (string, default `"https://api.captivate.fm"`)
- `options.timeoutMs` (number, default `60000`): timeout for regular requests
- `options.uploadTimeoutMs` (number, default `600000`): timeout for media and artwork uploads

---

### `authenticateUser()`

Authenticates with the user ID and API key and stores the token on `captivate.token`. You don't need to call this yourself: other methods call it automatically.

Returns: `Promise<string>`, the token. Throws `CaptivateApiError` if the request fails or the response has no token.

---

### `getUserShows()`

Fetches the shows associated with the user.

Returns: `Promise<Array>`, an array of show objects.

---

### `listEpisodes(showId)`

Fetches all episodes for a show. Captivate documents no pagination for this endpoint.

Returns: `Promise<{ episodes: Array, count: number }>`

---

### `listScheduledEpisodes(showId)`

Fetches the scheduled (future-dated) episodes for a show.

Returns: `Promise<{ episodes: Array, count: number }>`

---

### `getEpisode(episodeId)`

Fetches a single episode.

Returns: `Promise<Object>`, the episode.

---

### `findEpisodeByNumber(showId, episodeNumber)`

Looks for an episode with the given `episode_number`. It checks `listEpisodes`, then `listScheduledEpisodes`. Call it before `createEpisode` so a retried job doesn't create a duplicate.

If a listing's `count` is larger than the number of episodes it returned, the method throws a `CaptivateApiError`. It won't return `null` when it can't confirm the number is unused.

Returns: `Promise<Object | null>`

---

### `uploadEpisode(input, showId, options?)`

Uploads an episode media file (Captivate expects a constant-bit-rate MP3).

- `input`: a file path (`string`), a `Buffer`, or a `stream.Readable`
- `showId` (string)
- `options.filename` (string): **required** for Buffer and stream input; defaults to the file's basename for paths
- `options.contentType` (string, default `"audio/mpeg"`)

```js
await captivate.uploadEpisode("./episodes/ep12.mp3", showId);
await captivate.uploadEpisode(buffer, showId, { filename: "ep12.mp3" });
await captivate.uploadEpisode(s3Object.Body, showId, { filename: "ep12.mp3" });
```

Returns: `Promise<string>`, the media ID. Throws if the response has no media ID.

---

### `createEpisode(params)`

Creates a new podcast episode.

#### Required fields

- `showId` (string)
- `title` (string), also sent as `itunes_title`
- `mediaId` (string)
- `publishDate` (string): `YYYY-MM-DD HH:mm:ss` in the show's time zone (see [Publish dates and status](#️-publish-dates-and-status))
- `episodeNumber` (number)

#### Optional fields

Any field that isn't `null` or `undefined` is sent, so `false` values are kept.

- `showNotes` (string, max 4,000 characters)
- `summary` (string, max 4,000 characters)
- `episodeType` (`"full"`, `"trailer"`, or `"bonus"`)
- `subtitle` (string, max 255 characters)
- `author` (string, max 255 characters)
- `explicit` (boolean): `true` sends `"explicit"`, `false` sends `"clean"`; omit it to use the show's setting
- `status` (string): `"Draft"` to save a draft
- `episodeSeason` (number)
- `donationLink` (string)
- `donationText` (string)
- `episodeUrl` (string, URL), sent as `link`
- `episodeArt` (string, URL)
- `itunesBlock` (boolean), sent as `"true"` / `"false"`

Returns: `Promise<Object>`, the response, with the new episode at `record`. Throws if the response has no `record.id`.

---

### `updateEpisode(episodeId, fields)`

Updates an episode with `PUT /episodes/:id`. It takes the same field names as `createEpisode` and sends only the fields you pass.

> Captivate's docs don't say whether omitted fields are left unchanged. Until you've confirmed that partial updates are safe, pass every field you want the episode to keep. You can fetch them first with `getEpisode`.

Returns: `Promise<Object>`, the response data.

---

### `uploadArtwork(input, showId, options?)`

Uploads show artwork (JPG or PNG, square, 1400–3000 px, RGB, under 2 MB).

- `input`: a file path, a `Buffer`, or a `stream.Readable`
- `options.filename`: **required** for Buffer and stream input
- `options.contentType`: defaults to `image/png` for `.png`, otherwise `image/jpeg`

Returns: `Promise<{ url, raw }>`. `url` is read from `artwork.artwork_url` or `artwork_url` in the response. Throws if neither is present.

---

### `createShowArtwork(input, showId, options?)`

The original artwork method. It takes the same arguments as `uploadArtwork` but returns the raw response data. It doesn't require a URL in the response, because Captivate documents only `{ "success": true }`.

Returns: `Promise<Object>`

---

## 📊 Analytics / Insights API

These methods authenticate automatically, like the rest of the API, and throw `CaptivateApiError` on failure.

### `getAnalyticsOverview(showId, start, end, includeTopEpisodes?)`

Gets an overview of analytics for a show within a date range.

- `includeTopEpisodes` (boolean, default `true`)

Returns: `Promise<Object>`

---

### `getEpisodeAnalyticsOverview(showId, episodeId, start, end)`

Gets an analytics overview for a specific episode within a date range.

Returns: `Promise<Object>`

---

### `getAnalyticsAverages(showId, intervalDays?)`

Gets average analytics over a given interval.

- `intervalDays` (number, default `28`)

Returns: `Promise<Object>`

---

### `getAnalyticsTotal(showId)`

Gets all-time total downloads for a show.

Returns: `Promise<Object>`

---

### `getEpisodeAnalyticsTotal(showId, episodeId)`

Gets all-time total downloads for a specific episode.

Returns: `Promise<Object>`

---

### `getAnalyticsMonthly(showId)`

Gets month-by-month download analytics for a show.

Returns: `Promise<Object>`

---

### `getEpisodeAnalyticsMonthly(showId, episodeId)`

Gets month-by-month download analytics for a specific episode.

Returns: `Promise<Object>`

---

### `getAnalyticsRange(showId, params)`

Gets analytics within a custom date range, with breakdowns.

```js
const data = await captivate.getAnalyticsRange(showId, {
  start: "2026-01-01",
  end: "2026-01-31",
  interval: "1d",
  timezone: "America/New_York",
  countryCode: null,
  types: ["byLocation", "byUserAgentBrowser", "byUserAgentOs", "byUserAgentDevice"],
});
```

Returns: `Promise<Object>`

---

### `getEpisodeAnalyticsRange(showId, episodeId, params)`

The same as `getAnalyticsRange`, scoped to a specific episode.

Returns: `Promise<Object>`

---

### `getAnalyticsComparison(showId, episodes)`

Compares analytics between multiple episodes.

```js
const data = await captivate.getAnalyticsComparison(showId, [
  { id: "ep-id-1", title: "Episode 1", published_date: "2026-01-01" },
  { id: "ep-id-2", title: "Episode 2", published_date: "2026-01-15" },
]);
```

Returns: `Promise<Object>`

---

### `getWebPlayerAnalytics(showId, episodeId, params)`

Gets web player analytics for a specific episode.

```js
const data = await captivate.getWebPlayerAnalytics(showId, episodeId, {
  dateRange: { gte: "2026-01-01", lte: "2026-01-31" },
  duration: "1700",
  timezone: "America/New_York",
});
```

Returns: `Promise<Object>`

---

## ⬆️ Migrating from 0.x

1.0.0 is a breaking release, because methods now **throw instead of returning `undefined`**.

- **Errors throw.** In 0.x, every method caught errors, logged them with `console.error`, and resolved to `undefined`. In 1.x, failed requests reject with `CaptivateApiError` and invalid arguments reject with `TypeError`. The library no longer writes to the console. Wrap calls in `try`/`catch` (or `.catch`) wherever you used to check for `undefined`.
- **Authentication is automatic.** You no longer need to call `authenticateUser()` before other calls, though calling it still works. It now returns the token and throws on failure. A `401` triggers one re-authentication and one retry.
- **`getUserShows()` sends the `Authorization` header.** 0.x omitted it.
- **`createEpisode` is stricter:**
  - `showId`, `title`, `mediaId`, `publishDate` and `episodeNumber` are required.
  - `publishDate` must be `YYYY-MM-DD HH:mm:ss`; a date-only value such as `"2025-03-30"` now throws.
  - `showNotes`, `summary` and `episodeType` are optional and are left out when missing.
  - `explicit: false` and `itunesBlock: false` are now sent instead of being dropped.
  - `explicit` is serialized as `"explicit"` / `"clean"`.
  - The method throws if the response has no `record.id`.
- **The date's time zone.** The 0.x README said Captivate expects UTC. Per Captivate's docs, `date` is interpreted in the **show's** time zone. See [Publish dates and status](#️-publish-dates-and-status).
- **New upload input types.** `uploadEpisode` and `createShowArtwork` accept a file path, a `Buffer`, or a `stream.Readable`. A new optional last argument, `{ filename, contentType }`, is required for Buffer and stream input.
- **New methods:**
  - `uploadArtwork` returns `{ url, raw }`.
  - `getEpisode`
  - `listScheduledEpisodes`
  - `findEpisodeByNumber`
  - `updateEpisode`
- **Constructor options.** There's a new optional third argument, `{ apiBase, timeoutMs = 60000, uploadTimeoutMs = 600000 }`. `new Captivate(userId, apiKey)` still works.
- **Dependencies.** `moment` and `moment-timezone` are no longer dependencies. If you relied on them being installed through this package, add them to your own project.
- **Node.js 18+** is required.

---

## 🧪 Development

```bash
npm test          # run tests once
npm run test:watch
npm run build     # dist/index.cjs.js, dist/index.esm.js, dist/index.esm.mjs
npm run smoke     # require() the CJS build and import() the ESM build
```

### Releasing

The GitHub Actions workflow runs tests, the build, and smoke tests on every pull request and on every push to `main`. After a push to `main`, it publishes to npm **only if the `version` in `package.json` is not already on npm**. To release, bump `version` (and add a `CHANGELOG.md` entry) in the PR you merge.

---

## 🧪 Project Structure

```
captivate-fm-api-client/
├── src/
│   ├── captivate.js       # Main Captivate class
│   ├── errors.js          # CaptivateApiError
│   ├── index.js           # CJS entry point
│   ├── index.mjs          # ESM entry point
│   └── *.test.js          # Jest tests
├── scripts/               # Build smoke tests
├── index.d.ts             # TypeScript declarations
├── dist/                  # Bundled output (via Rollup)
├── CHANGELOG.md
├── package.json
└── README.md
```

---

## ✅ TODO

- [x] Add support for editing episodes (`updateEpisode`; confirm partial-update behavior against the live API)
- [ ] Add listing media files
- [x] Add analytics / insights endpoints

---

## 📄 License

MIT License

---

## 🙌 Contributions

PRs welcome! If you're using this in production or want to extend it with more API features (like transcripts), feel free to open an issue or pull request.
