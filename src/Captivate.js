const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
/**
 * Creates a new Captivate API client.
 *
 * @param {string} userId - The user ID for authentication.
 * @param {string} apiKey - The API key for authentication.
 * @function Captivate#authenticateUser
 * @function Captivate#createEpisode
 * @function Captivate#listEpisodes
 * @function Captivate#uploadEpisode
 */
class Captivate {
  constructor(userId, apiKey) {
    this.token = "";
    this.apiBase = "https://api.captivate.fm";
    this.userId = userId;
    this.apiKey = apiKey;
  }

  async getUserShows() {
    var config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/users/${this.userId}/shows`,
      headers: {},
    };

    try {
      const response = await axios(config);
      return response.data.shows;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Retrieves a list of shows associated with the authenticated user.
   *
   * @returns {Promise<Array>} A promise that resolves to an array of shows.
   * @throws Will throw an error if the request fails.
   */
  async getUserShows() {
    var config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/users/${this.userId}/shows`,
      headers: {},
    };

    try {
      const response = await axios(config);
      return response.data.shows;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Retrieves a list of episodes for a given show.
   *
   * @param {string} showId - The ID of the show for which to list episodes.
   *
   * @returns {Promise<Object>} A promise that resolves to the response data containing the list of episodes.
   * @throws Will throw an error if the request fails.
   */
  async listEpisodes(showId) {
    const config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/shows/${showId}/episodes`,
      headers: { Authorization: `Bearer ${this.token}` },
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Uploads an episode media file to a given show.
   *
   * @param {string} filePath - The path to the media file to be uploaded.
   * @param {string} showId - The ID of the show to which the media file will be uploaded.
   *
   * @returns {Promise<string>} A promise that resolves when the media file is uploaded and the media ID is set.
   * @throws Will throw an error if the upload request fails.
   */
  async uploadEpisode(filePath, showId) {
    const data = new FormData();
    data.append("file", fs.createReadStream(filePath));

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/shows/${showId}/media`,
      headers: {
        "Content-Type": "multipart/form-data",
        ...data.getHeaders(),
        Authorization: `Bearer ${this.token}`,
      },
      data: data,
    };

    try {
      const response = await axios(config);
      return response.data.media.id;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Creates a new episode for a given show.
   *
   * @param {Object} params - The parameters for creating an episode.
   * @param {string} params.showId - The ID of the show.
   * @param {string} params.title - The title of the episode.
   * @param {string} params.mediaId - The media ID of the episode.
   * @param {string} params.showNotes - The show notes for the episode.
   * @param {string} params.publishDate - The publish date of the episode.
   * @param {string} params.summary - The summary of the episode.
   * @param {string} params.episodeType - The type of the episode.
   * @param {string} [params.subtitle=null] - The subtitle of the episode.
   * @param {string} [params.author=null] - The author of the episode.
   * @param {boolean} [params.explicit=null] - Whether the episode is explicit.
   * @param {string} [params.status=null] - The status of the episode.
   * @param {number} [params.episodeSeason=null] - The season number of the episode.
   * @param {string} [params.donationLink=null] - The donation link for the episode.
   * @param {string} [params.donationText=null] - The donation text for the episode.
   * @param {string} [params.episodeUrl=null] - The URL of the episode.
   * @param {string} [params.episodeArt=null] - The artwork for the episode.
   * @param {number} params.episodeNumber - The episode number.
   * @param {boolean} [params.itunesBlock=false] - Whether to block the episode on iTunes.
   *
   * @returns {Promise<Object>} The response data from the API.
   */
  async createEpisode({
    showId,
    title,
    mediaId,
    showNotes,
    publishDate,
    summary,
    episodeType,
    subtitle = null,
    author = null,
    explicit = null,
    status = null,
    episodeSeason = null,
    donationLink = null,
    donationText = null,
    episodeUrl = null,
    episodeArt = null,
    episodeNumber,
    itunesBlock = false,
  }) {
    const data = new FormData();
    data.append("shows_id", showId);
    data.append("title", title);
    data.append("itunes_title", title);
    data.append("media_id", mediaId);
    data.append("date", publishDate);
    data.append("episode_number", episodeNumber);
    data.append("episode_type", episodeType);
    data.append("shownotes", showNotes);
    data.append("summary", summary);
    status ? data.append("status", status) : null;
    subtitle ? data.append("itunes_subtitle", subtitle) : null;
    author ? data.append("author", author) : null;
    episodeArt ? data.append("episode_art", episodeArt) : null;
    explicit ? data.append("explicit", explicit) : null;
    episodeSeason ? data.append("episode_season", episodeSeason) : null;
    donationLink ? data.append("donation_link", donationLink) : null;
    donationText ? data.append("donation_text", donationText) : null;
    episodeUrl ? data.append("link", episodeUrl) : null;
    itunesBlock ? data.append("itunes_block", itunesBlock) : null;

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/episodes`,
      headers: {
        ...data.getHeaders(),
        Authorization: `Bearer ${this.token}`,
      },
      data: data,
    };
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Authenticates the user with the provided userId and apiKey.
   *
   * @returns {Promise<string>} A promise that resolves when the user is authenticated and the token is set.
   * @throws Will throw an error if the authentication request fails.
   */
  async authenticateUser() {
    const data = new FormData();
    data.append("username", this.userId);
    data.append("token", this.apiKey);

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${this.apiBase}/authenticate/token`,
      headers: {
        ...data.getHeaders(),
        Authorization: `Bearer ${this.token}`,
      },
      data: data,
    };

    try {
      const response = await axios(config);
      this.token = response.data.user.token;
    } catch (error) {
      console.error(error);
    }
  }
}

module.exports = Captivate;
