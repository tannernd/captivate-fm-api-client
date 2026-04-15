# Captivate API Client

A Node.js client for interacting with the [Captivate.fm](https://www.captivate.fm) API. Authenticate, upload media files, list shows and episodes, and create new podcast episodes using a simple, async-friendly interface.

---

## 🚀 Features

- 🔐 Authenticate using Captivate.fm API credentials
- 📤 Upload media files to your shows
- 🎙️ Create new podcast episodes
- 📺 List shows and episodes
- 🎨 Upload artwork
- 📊 Full Analytics / Insights API support
- ✅ Async/await-ready with clean API

---

## 📦 Installation

```bash
npm install captivate-fm-api-client
```

---

## 🔧 Requirements

- Node.js v14+
- Captivate.fm API access (user ID & API key)

---

## 🛠️ Usage

```js
const Captivate = require("captivate-api-client");

const captivate = new Captivate(
  process.env.CAPTIVATE_USER_ID,
  process.env.CAPTIVATE_API_KEY
);

(async () => {
  await captivate.authenticateUser();

  const shows = await captivate.getUserShows();
  const showId = shows[0].id;

  // Upload media file
  const mediaId = await captivate.uploadEpisode("./episodes/my-ep.mp3", showId);

  // Create an episode
  const episode = await captivate.createEpisode({
    showId,
    title: "Episode Title",
    mediaId,
    showNotes: "This is the show notes content.",
    publishDate: "2025-03-30",
    summary: "Short summary of the episode.",
    episodeType: "full",
    episodeNumber: 5,
    explicit: false,
  });

  console.log("Episode created:", episode);
})();
```

---

## 📚 API Reference

### `new Captivate(userId, apiKey)`

Create a new client instance.

---

### `authenticateUser()`

Authenticates with Captivate using the provided credentials.

Returns: `Promise<void>`

---

### `getUserShows()`

Fetches the list of shows associated with the user.

Returns: `Promise<Array>` – array of show objects

---

### `listEpisodes(showId)`

Fetches all episodes for a specific show.

- `showId` (string): The ID of the show

Returns: `Promise<Object>` – episodes response

---

### `uploadEpisode(filePath, showId)`

Uploads a media file (e.g. `.mp3`) to a specific show.

- `filePath` (string): Local path to the file
- `showId` (string): The show ID to associate the media with

Returns: `Promise<string>` – media ID

---

### `createEpisode(params)`

Creates a new podcast episode.

#### Required fields:

- `showId` (string)
- `title` (string)
- `mediaId` (string)
- `showNotes` (string)
- `publishDate` (string)
- `summary` (string)
- `episodeType` (string)
- `episodeNumber` (number)

#### Optional fields:

- `subtitle` (string)
- `author` (string)
- `explicit` (boolean)
- `status` (string)
- `episodeSeason` (number)
- `donationLink` (string)
- `donationText` (string)
- `episodeUrl` (string)
- `episodeArt` (string)
- `itunesBlock` (boolean)

Returns: `Promise<Object>` – created episode data

---

### `createShowArtwork(filePath, showId)`

Uploads artwork for a show.

- `filePath` (string): Local path to the image file
- `showId` (string): The show ID

Returns: `Promise<Object>` - artwork response

---

## 📊 Analytics / Insights API

All analytics methods require authentication first (`authenticateUser()`).

### `getAnalyticsOverview(showId, start, end, includeTopEpisodes?)`

Gets an overview of analytics for a show within a date range.

- `includeTopEpisodes` (boolean, default `true`)

Returns: `Promise<Object>`

---

### `getEpisodeAnalyticsOverview(showId, episodeId, start, end)`

Gets analytics overview for a specific episode within a date range.

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

Gets analytics within a custom date range with breakdowns.

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

Same as `getAnalyticsRange` but scoped to a specific episode.

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

## 🌍 Timezone Notes

Captivate expects dates and times in **UTC**. Use `moment-timezone` to convert your local time:

```js
const moment = require("moment-timezone");
const publishDate = moment
  .tz("2025-03-30 11:00", "America/Denver")
  .utc()
  .format("YYYY-MM-DD");
```

---

## 🧪 Project Structure

```
captivate-fm-api-client/
├── src/
│   ├── captivate.js       # Main Captivate class
│   ├── captivate.test.js  # Jest tests
│   └── index.js           # Entry point
├── dist/                  # Bundled output (via Rollup)
├── CHANGELOG.md
├── package.json
└── README.md
```

---

## ✅ TODO

- [ ] Add support for editing episodes
- [ ] Add listing media files
- [x] Add analytics / insights endpoints

---

## 📄 License

MIT License

---

## 🙌 Contributions

PRs welcome! If you're using this in production or want to extend it with additional API features (like analytics or transcripts), feel free to open an issue or pull request.

```

```
