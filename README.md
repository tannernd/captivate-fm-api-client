# Captivate API Client

A Node.js client for interacting with the [Captivate.fm](https://www.captivate.fm) API. Authenticate, upload media files, list shows and episodes, and create new podcast episodes using a simple, async-friendly interface.

---

## 🚀 Features

- 🔐 Authenticate using Captivate.fm API credentials
- 📤 Upload media files to your shows
- 🎙️ Create new podcast episodes
- 📺 List shows and episodes
- 🎨 Upload artwork
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
captivate-api-client/
├── src/
│   └── index.js       # Main Captivate class
├── dist/              # Bundled output (via Rollup)
├── package.json
└── README.md
```

---

## ✅ TODO

- [ ] Add support for editing episodes
- [ ] Add listing media files

---

## 📄 License

MIT License

---

## 🙌 Contributions

PRs welcome! If you're using this in production or want to extend it with additional API features (like analytics or transcripts), feel free to open an issue or pull request.

```

```
