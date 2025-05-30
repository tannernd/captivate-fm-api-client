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
});
