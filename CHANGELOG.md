# Changelog

## [1.0.0] - 2026-10-08

### Breaking

- Every method now throws instead of logging with `console.error` and resolving to `undefined`. Failed requests reject with the new exported `CaptivateApiError` (`method`, `endpoint`, `status`, `responseBody`, `cause`). Invalid arguments reject with `TypeError` before any request is made.
- Methods also throw when a successful response is missing a field the caller depends on:
  - `authenticateUser`: `user.token`
  - `uploadEpisode`: `media.id`
  - `createEpisode`: `record.id`
  - `uploadArtwork`: the artwork URL
  - the list methods: their arrays
  - any response with `success: false`
- `createEpisode`:
  - requires `showId`, `title`, `mediaId`, `publishDate` and `episodeNumber`
  - requires `publishDate` to be formatted `YYYY-MM-DD HH:mm:ss`
  - serializes `explicit` as `"explicit"`/`"clean"`
- The library no longer writes to the console.
- Node.js 18+ is required.
- Removed the unused `moment` and `moment-timezone` dependencies.

### Added

- Lazy authentication: any call made without a token authenticates first. Concurrent calls share one auth request.
- On a `401`, the client re-authenticates once and retries the request once.
- `uploadEpisode` and `createShowArtwork` accept a file path, a `Buffer`, or a `stream.Readable`, plus an optional `{ filename, contentType }` argument.
- `uploadArtwork(input, showId, options)` returns `{ url, raw }`.
- `getEpisode(episodeId)`, `listScheduledEpisodes(showId)`, `findEpisodeByNumber(showId, episodeNumber)` and `updateEpisode(episodeId, fields)`.
- Constructor options `{ apiBase, timeoutMs = 60000, uploadTimeoutMs = 600000 }`, applied to every request.
- TypeScript declarations (`index.d.ts`).
- `dist/index.esm.mjs`, so native Node ESM `import` works on every supported Node version.

### Fixed

- `getUserShows` now sends the `Authorization` header.
- `createEpisode` no longer drops `false` values for `explicit` and `itunesBlock`.
- The source file is now `src/captivate.js`, matching the `require("./captivate")` path. Before, the package built only on case-insensitive filesystems.
- README: `date` is interpreted in the show's time zone, not UTC. The usage example also had the wrong package name.

### Changed

- CI runs `npm ci`, the tests, the build, and smoke tests on pull requests and pushes to `main`.
- CI publishes to npm only when the `package.json` version isn't already published.
- CI publishes with npm Trusted Publishing (OIDC) instead of an `NPM_TOKEN` secret. Releases get provenance attestations automatically.
- `npm test` no longer runs in watch mode; use `npm run test:watch`.


## [0.2.1] - 2026-04-15

### Fixed

- Removed empty `Authorization: Bearer ` header from `authenticateUser()` — Captivate's auth endpoint rejects requests with an empty Bearer token

## [0.2.0] - 2026-04-15

### Added

- **Analytics / Insights API** - 11 new methods covering the full Captivate.fm Insights API:
  - `getAnalyticsOverview(showId, start, end, includeTopEpisodes)` - Show overview within a date range
  - `getEpisodeAnalyticsOverview(showId, episodeId, start, end)` - Episode overview within a date range
  - `getAnalyticsAverages(showId, intervalDays)` - Average analytics over a given interval
  - `getAnalyticsTotal(showId)` - All-time total downloads for a show
  - `getEpisodeAnalyticsTotal(showId, episodeId)` - All-time total downloads for an episode
  - `getAnalyticsMonthly(showId)` - Month-by-month download analytics for a show
  - `getEpisodeAnalyticsMonthly(showId, episodeId)` - Month-by-month downloads for an episode
  - `getAnalyticsRange(showId, params)` - Custom date range analytics with breakdowns
  - `getEpisodeAnalyticsRange(showId, episodeId, params)` - Custom date range for an episode
  - `getAnalyticsComparison(showId, episodes)` - Compare analytics between episodes
  - `getWebPlayerAnalytics(showId, episodeId, params)` - Web player analytics for an episode
- Tests for all 11 new analytics methods

## [0.1.3] - 2025-06-01

- `createShowArtwork(filePath, showId)` support

## [0.1.2] - 2025-05-30

- Initial release: authentication, show listing, episode CRUD, media upload
