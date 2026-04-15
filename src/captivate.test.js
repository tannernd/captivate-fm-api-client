const Captivate = require("./captivate");
const axios = require("axios");
const fs = require("fs");

jest.mock("axios");
jest.mock("fs");

describe("Captivate API Client", () => {
  let client;

  beforeEach(() => {
    client = new Captivate("testUser", "testKey");
    client.token = "fakeToken";
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("getUserShows returns shows list", async () => {
    axios.mockResolvedValue({ data: { shows: ["show1", "show2"] } });

    const shows = await client.getUserShows();

    expect(shows).toEqual(["show1", "show2"]);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        url: expect.stringContaining("/users/testUser/shows"),
      })
    );
  });

  test("listEpisodes returns episodes list", async () => {
    axios.mockResolvedValue({ data: { episodes: [] } });

    const data = await client.listEpisodes("show123");

    expect(data).toEqual({ episodes: [] });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        url: expect.stringContaining("/shows/show123/episodes"),
        headers: expect.objectContaining({ Authorization: "Bearer fakeToken" }),
      })
    );
  });

  test("uploadEpisode uploads file and returns media ID", async () => {
    fs.createReadStream.mockReturnValue("mockStream");
    axios.mockResolvedValue({ data: { media: { id: "media123" } } });

    const mediaId = await client.uploadEpisode("mockPath.mp3", "showId");

    expect(mediaId).toBe("media123");
    expect(axios).toHaveBeenCalled();
  });

  test("createEpisode creates an episode and returns response", async () => {
    axios.mockResolvedValue({ data: { success: true } });

    const result = await client.createEpisode({
      showId: "showId",
      title: "Episode Title",
      mediaId: "mediaId123",
      showNotes: "Show notes",
      publishDate: "2025-05-30",
      summary: "Summary",
      episodeType: "full",
      episodeNumber: 1,
    });

    expect(result).toEqual({ success: true });
    expect(axios).toHaveBeenCalled();
  });

  test("authenticateUser sets token after authentication", async () => {
    axios.mockResolvedValue({ data: { user: { token: "newToken123" } } });

    await client.authenticateUser();

    expect(client.token).toBe("newToken123");
    expect(axios).toHaveBeenCalled();
  });

  test("createShowArtwork uploads artwork and returns response", async () => {
    fs.createReadStream.mockReturnValue("mockStream");
    axios.mockResolvedValue({ data: { artwork: "url/to/art" } });

    const result = await client.createShowArtwork("mockArtwork.png", "showId");

    expect(result).toEqual({ artwork: "url/to/art" });
    expect(axios).toHaveBeenCalled();
  });

  // ─── Analytics / Insights ───────────────────────────────────────────

  test("getAnalyticsOverview calls correct endpoint with params", async () => {
    axios.mockResolvedValue({ data: { overview: "data" } });

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
    axios.mockResolvedValue({ data: { episode_overview: "data" } });

    const result = await client.getEpisodeAnalyticsOverview("show1", "ep1", "2026-01-01", "2026-01-31");

    expect(result).toEqual({ episode_overview: "data" });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/overview/ep1"),
      })
    );
  });

  test("getAnalyticsAverages calls correct endpoint with interval", async () => {
    axios.mockResolvedValue({ data: { averages: "data" } });

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
    axios.mockResolvedValue({ data: { total: 50000 } });

    const result = await client.getAnalyticsTotal("show1");

    expect(result).toEqual({ total: 50000 });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/total"),
      })
    );
  });

  test("getEpisodeAnalyticsTotal returns episode total", async () => {
    axios.mockResolvedValue({ data: { total: 1200 } });

    const result = await client.getEpisodeAnalyticsTotal("show1", "ep1");

    expect(result).toEqual({ total: 1200 });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/total/ep1"),
      })
    );
  });

  test("getAnalyticsMonthly returns monthly data", async () => {
    axios.mockResolvedValue({ data: { monthly: { "2026-01": 100 } } });

    const result = await client.getAnalyticsMonthly("show1");

    expect(result).toEqual({ monthly: { "2026-01": 100 } });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/monthly"),
      })
    );
  });

  test("getEpisodeAnalyticsMonthly returns episode monthly data", async () => {
    axios.mockResolvedValue({ data: { monthly: { "2026-01": 50 } } });

    const result = await client.getEpisodeAnalyticsMonthly("show1", "ep1");

    expect(result).toEqual({ monthly: { "2026-01": 50 } });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/insights/show1/monthly/ep1"),
      })
    );
  });

  test("getAnalyticsRange posts range query", async () => {
    axios.mockResolvedValue({ data: { range: "data" } });

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
    axios.mockResolvedValue({ data: { range: "episode_data" } });

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
    axios.mockResolvedValue({ data: { comparison: "data" } });

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
    axios.mockResolvedValue({ data: { webPlayer: "data" } });

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
});
