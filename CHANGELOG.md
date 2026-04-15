# Changelog

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
