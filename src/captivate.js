const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { CaptivateApiError } = require("./errors");

const DEFAULT_API_BASE = "https://api.captivate.fm";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 600000;

// "YYYY-MM-DD HH:mm:ss" with sane ranges for each component.
const PUBLISH_DATE_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const IMAGE_CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function requireParams(sdkMethod, params) {
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      throw new TypeError(`${sdkMethod}: missing required parameter "${name}"`);
    }
  }
}

function isReadableStream(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.pipe === "function" &&
    typeof value.on === "function"
  );
}

function audioContentType() {
  return "audio/mpeg";
}

function imageContentType(filename) {
  return IMAGE_CONTENT_TYPES[path.extname(filename || "").toLowerCase()] || "image/jpeg";
}

function validatePublishDate(sdkMethod, publishDate) {
  if (typeof publishDate !== "string" || !PUBLISH_DATE_PATTERN.test(publishDate)) {
    throw new TypeError(
      `${sdkMethod}: publishDate must be formatted "YYYY-MM-DD HH:mm:ss", got ${JSON.stringify(publishDate)}`
    );
  }
}

function serializeExplicit(value) {
  if (value === true) return "explicit";
  if (value === false) return "clean";
  return value;
}

// SDK field name -> [Captivate form field, serializer]. `title` is also sent as `itunes_title`.
const EPISODE_FIELDS = [
  ["showId", "shows_id"],
  ["title", "title"],
  ["title", "itunes_title"],
  ["mediaId", "media_id"],
  ["publishDate", "date"],
  ["status", "status"],
  ["showNotes", "shownotes"],
  ["summary", "summary"],
  ["subtitle", "itunes_subtitle"],
  ["author", "author"],
  ["episodeArt", "episode_art"],
  ["explicit", "explicit", serializeExplicit],
  ["episodeType", "episode_type"],
  ["episodeSeason", "episode_season"],
  ["episodeNumber", "episode_number"],
  ["donationLink", "donation_link"],
  ["donationText", "donation_text"],
  ["episodeUrl", "link"],
  ["itunesBlock", "itunes_block"],
];

/**
 * Builds the multipart body for create/update episode. Sends every field that
 * is not null or undefined, so `false` booleans are kept.
 */
function episodeForm(params) {
  const form = new FormData();
  for (const [key, field, serialize] of EPISODE_FIELDS) {
    let value = params[key];
    if (value === undefined || value === null) continue;
    if (serialize) value = serialize(value);
    form.append(field, typeof value === "string" ? value : String(value));
  }
  return form;
}

/**
 * Normalizes an upload input (file path, Buffer, or Readable) into something
 * that can build a fresh multipart body for each attempt.
 */
function toUploadSource(sdkMethod, input, options, defaultContentType) {
  const opts = options || {};
  let filename = opts.filename;
  let open;
  let replayable = true;

  if (typeof input === "string") {
    if (input === "") {
      throw new TypeError(`${sdkMethod}: file path must not be empty`);
    }
    filename = filename || path.basename(input);
    open = () => fs.createReadStream(input);
  } else if (Buffer.isBuffer(input)) {
    open = () => input;
  } else if (isReadableStream(input)) {
    open = () => input;
    replayable = false;
  } else {
    throw new TypeError(
      `${sdkMethod}: input must be a file path string, a Buffer, or a stream.Readable`
    );
  }

  if (!filename) {
    throw new TypeError(
      `${sdkMethod}: options.filename is required when uploading a Buffer or stream`
    );
  }

  const contentType = opts.contentType || defaultContentType(filename);
  return {
    replayable,
    buildForm() {
      const form = new FormData();
      form.append("file", open(), { filename, contentType });
      return form;
    },
  };
}

/**
 * Creates a new Captivate API client.
 *
 * Every method returns a promise that either resolves with the documented value
 * or rejects. Failed requests reject with a {@link CaptivateApiError}; invalid
 * arguments reject with a `TypeError` before any request is made.
 *
 * @param {string} userId - The user ID for authentication.
 * @param {string} apiKey - The API key for authentication.
 * @param {Object} [options]
 * @param {string} [options.apiBase="https://api.captivate.fm"] - API base URL.
 * @param {number} [options.timeoutMs=60000] - Timeout for regular requests.
 * @param {number} [options.uploadTimeoutMs=600000] - Timeout for media and artwork uploads.
 */
class Captivate {
  constructor(userId, apiKey, options = {}) {
    const {
      apiBase = DEFAULT_API_BASE,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      uploadTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
    } = options || {};
    this.token = "";
    this.apiBase = apiBase.replace(/\/+$/, "");
    this.userId = userId;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.uploadTimeoutMs = uploadTimeoutMs;
    this._authPromise = null;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  /**
   * Sends a request, authenticating first if there is no token, and
   * re-authenticating and retrying once on a 401.
   *
   * @param {string} sdkMethod - Public method name, for error reporting.
   * @param {Object} request
   * @param {string} request.method - HTTP method.
   * @param {string} request.path - Path relative to apiBase.
   * @param {Object} [request.params] - Query parameters.
   * @param {Function} [request.data] - Builds the request body for each attempt.
   * @param {Object} [request.headers] - Extra headers.
   * @param {boolean} [request.upload=false] - Use uploadTimeoutMs.
   * @param {boolean} [request.replayable=true] - Whether the body can be resent.
   * @returns {Promise<Object>} The axios response.
   */
  async _request(sdkMethod, { method, path: urlPath, params, data, headers = {}, upload = false, replayable = true }) {
    const endpoint = `${method.toUpperCase()} ${urlPath}`;

    if (!this.token) {
      await this.authenticateUser();
    }

    let reauthenticated = false;
    for (;;) {
      const body = data ? data() : undefined;
      const config = {
        method,
        url: `${this.apiBase}${urlPath}`,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        headers: {
          ...(body instanceof FormData ? body.getHeaders() : {}),
          ...headers,
          Authorization: `Bearer ${this.token}`,
        },
      };
      if (params !== undefined) config.params = params;
      if (body !== undefined) config.data = body;

      let response;
      try {
        response = await this._send(sdkMethod, endpoint, config, upload ? this.uploadTimeoutMs : this.timeoutMs);
      } catch (error) {
        if (error instanceof CaptivateApiError) throw error;
        const status = error && error.response ? error.response.status : null;
        if (status === 401 && !reauthenticated) {
          reauthenticated = true;
          await this.authenticateUser();
          if (!replayable) {
            throw new CaptivateApiError(
              `${sdkMethod}: ${endpoint} returned 401 and the stream input cannot be replayed; ` +
                "re-authenticated, retry with a fresh stream, a Buffer, or a file path",
              { method: sdkMethod, endpoint, status, responseBody: error.response.data, cause: error }
            );
          }
          continue;
        }
        throw CaptivateApiError.fromRequestError(sdkMethod, endpoint, error);
      }

      // Captivate write endpoints report `success`, `errors` and `errfor`;
      // treat an explicit `success: false` as a failure even on HTTP 2xx.
      if (response && response.data && response.data.success === false) {
        throw new CaptivateApiError(`${sdkMethod}: ${endpoint} returned success: false`, {
          method: sdkMethod,
          endpoint,
          status: response.status ?? null,
          responseBody: response.data,
        });
      }
      return response;
    }
  }

  /**
   * Calls axios with both axios's inactivity timeout and a hard deadline, and
   * converts any failure into a CaptivateApiError (keeping 401s recognizable).
   */
  async _send(sdkMethod, endpoint, config, timeoutMs) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await axios({ ...config, timeout: timeoutMs, signal });
    } catch (error) {
      if (signal.aborted && !(error && error.response)) {
        throw new CaptivateApiError(`${sdkMethod}: ${endpoint} timed out after ${timeoutMs}ms`, {
          method: sdkMethod,
          endpoint,
          status: null,
          cause: error,
        });
      }
      throw error;
    }
  }

  _missingField(sdkMethod, endpoint, field, response) {
    return new CaptivateApiError(
      `${sdkMethod}: ${endpoint} succeeded but the response has no ${field}`,
      { method: sdkMethod, endpoint, status: response.status ?? null, responseBody: response.data }
    );
  }

  // ─── Authentication ─────────────────────────────────────────────────

  /**
   * Authenticates with the userId and apiKey given to the constructor and
   * stores the token on `this.token`. Other methods call this automatically
   * when there is no token or a request returns 401, so calling it yourself
   * is optional.
   *
   * Concurrent calls share a single in-flight request.
   *
   * @returns {Promise<string>} The new token.
   * @throws {CaptivateApiError} If the request fails or the response has no token.
   */
  async authenticateUser() {
    if (!this._authPromise) {
      this._authPromise = this._authenticate().finally(() => {
        this._authPromise = null;
      });
    }
    return this._authPromise;
  }

  async _authenticate() {
    const sdkMethod = "authenticateUser";
    const urlPath = "/authenticate/token";
    const endpoint = `POST ${urlPath}`;
    requireParams(sdkMethod, { userId: this.userId, apiKey: this.apiKey });

    const data = new FormData();
    data.append("username", this.userId);
    data.append("token", this.apiKey);

    let response;
    try {
      response = await this._send(
        sdkMethod,
        endpoint,
        {
          method: "post",
          url: `${this.apiBase}${urlPath}`,
          maxBodyLength: Infinity,
          headers: { ...data.getHeaders() },
          data,
        },
        this.timeoutMs
      );
    } catch (error) {
      if (error instanceof CaptivateApiError) throw error;
      throw CaptivateApiError.fromRequestError(sdkMethod, endpoint, error);
    }

    const token = response.data && response.data.user && response.data.user.token;
    if (!token) {
      throw this._missingField(sdkMethod, endpoint, "user.token", response);
    }
    this.token = token;
    return token;
  }

  // ─── Shows ──────────────────────────────────────────────────────────

  /**
   * Retrieves the shows the authenticated user can access.
   *
   * @returns {Promise<Array>} An array of shows.
   * @throws {CaptivateApiError} If the request fails or the response has no shows array.
   */
  async getUserShows() {
    const sdkMethod = "getUserShows";
    requireParams(sdkMethod, { userId: this.userId });
    const urlPath = `/users/${this.userId}/shows`;
    const response = await this._request(sdkMethod, { method: "get", path: urlPath });
    if (!response.data || !Array.isArray(response.data.shows)) {
      throw this._missingField(sdkMethod, `GET ${urlPath}`, "shows array", response);
    }
    return response.data.shows;
  }

  /**
   * Uploads artwork for a show and returns the raw response.
   * See {@link Captivate#uploadArtwork} for a version that returns the URL.
   *
   * @param {string|Buffer|import("stream").Readable} input - File path, Buffer, or readable stream.
   * @param {string} showId - The show ID.
   * @param {Object} [options]
   * @param {string} [options.filename] - Required for Buffer and stream input.
   * @param {string} [options.contentType] - Defaults to image/png for .png, otherwise image/jpeg.
   * @returns {Promise<Object>} The response data.
   * @throws {CaptivateApiError} If the request fails or the response reports `success: false`.
   */
  async createShowArtwork(input, showId, options) {
    const response = await this._postArtwork("createShowArtwork", input, showId, options);
    return response.data;
  }

  /**
   * Uploads artwork for a show.
   *
   * @param {string|Buffer|import("stream").Readable} input - File path, Buffer, or readable stream.
   * @param {string} showId - The show ID.
   * @param {Object} [options]
   * @param {string} [options.filename] - Required for Buffer and stream input.
   * @param {string} [options.contentType] - Defaults to image/png for .png, otherwise image/jpeg.
   * @returns {Promise<{url: string, raw: Object}>} The artwork URL and the raw response data.
   * @throws {CaptivateApiError} If the request fails or the response has no artwork URL.
   */
  async uploadArtwork(input, showId, options) {
    const sdkMethod = "uploadArtwork";
    const response = await this._postArtwork(sdkMethod, input, showId, options);
    const raw = response.data;
    const url = raw && ((raw.artwork && raw.artwork.artwork_url) || raw.artwork_url);
    if (!url) {
      throw this._missingField(
        sdkMethod,
        `POST /shows/${showId}/artwork`,
        "artwork.artwork_url or artwork_url",
        response
      );
    }
    return { url, raw };
  }

  async _postArtwork(sdkMethod, input, showId, options) {
    requireParams(sdkMethod, { showId });
    const source = toUploadSource(sdkMethod, input, options, imageContentType);
    return this._request(sdkMethod, {
      method: "post",
      path: `/shows/${showId}/artwork`,
      data: () => source.buildForm(),
      upload: true,
      replayable: source.replayable,
    });
  }

  // ─── Media ──────────────────────────────────────────────────────────

  /**
   * Uploads an episode media file to a show.
   *
   * @param {string|Buffer|import("stream").Readable} input - File path, Buffer, or readable stream.
   * @param {string} showId - The show to upload the media to.
   * @param {Object} [options]
   * @param {string} [options.filename] - Required for Buffer and stream input.
   * @param {string} [options.contentType="audio/mpeg"] - Content type of the file part.
   * @returns {Promise<string>} The media ID.
   * @throws {CaptivateApiError} If the request fails or the response has no media ID.
   */
  async uploadEpisode(input, showId, options) {
    const sdkMethod = "uploadEpisode";
    requireParams(sdkMethod, { showId });
    const source = toUploadSource(sdkMethod, input, options, audioContentType);
    const urlPath = `/shows/${showId}/media`;
    const response = await this._request(sdkMethod, {
      method: "post",
      path: urlPath,
      data: () => source.buildForm(),
      upload: true,
      replayable: source.replayable,
    });
    const mediaId = response.data && response.data.media && response.data.media.id;
    if (!mediaId) {
      throw this._missingField(sdkMethod, `POST ${urlPath}`, "media.id", response);
    }
    return mediaId;
  }

  // ─── Episodes ───────────────────────────────────────────────────────

  /**
   * Retrieves the episodes for a show.
   *
   * @param {string} showId - The show ID.
   * @returns {Promise<Object>} The response data, including an `episodes` array.
   * @throws {CaptivateApiError} If the request fails or the response has no episodes array.
   */
  async listEpisodes(showId) {
    const sdkMethod = "listEpisodes";
    requireParams(sdkMethod, { showId });
    const urlPath = `/shows/${showId}/episodes`;
    const response = await this._request(sdkMethod, { method: "get", path: urlPath });
    if (!response.data || !Array.isArray(response.data.episodes)) {
      throw this._missingField(sdkMethod, `GET ${urlPath}`, "episodes array", response);
    }
    return response.data;
  }

  /**
   * Retrieves a single episode.
   *
   * @param {string} episodeId - The episode ID.
   * @returns {Promise<Object>} The episode.
   * @throws {CaptivateApiError} If the request fails or the response has no episode.
   */
  async getEpisode(episodeId) {
    const sdkMethod = "getEpisode";
    requireParams(sdkMethod, { episodeId });
    const urlPath = `/episodes/${episodeId}`;
    const response = await this._request(sdkMethod, { method: "get", path: urlPath });
    if (!response.data || !response.data.episode) {
      throw this._missingField(sdkMethod, `GET ${urlPath}`, "episode", response);
    }
    return response.data.episode;
  }

  /**
   * Retrieves the scheduled (future-dated) episodes for a show.
   *
   * @param {string} showId - The show ID.
   * @returns {Promise<Object>} The response data, including an `episodes` array.
   * @throws {CaptivateApiError} If the request fails or the response has no episodes array.
   */
  async listScheduledEpisodes(showId) {
    const sdkMethod = "listScheduledEpisodes";
    requireParams(sdkMethod, { showId });
    const urlPath = `/shows/${showId}/episodes/scheduled`;
    const response = await this._request(sdkMethod, { method: "get", path: urlPath });
    if (!response.data || !Array.isArray(response.data.episodes)) {
      throw this._missingField(sdkMethod, `GET ${urlPath}`, "episodes array", response);
    }
    return response.data;
  }

  /**
   * Finds an episode in a show by its episode number. Use this before
   * `createEpisode` so a retried job does not create a duplicate.
   *
   * Captivate documents no pagination for episode listings, so this checks the
   * full episode list and then the scheduled episode list. If a listing's
   * `count` is larger than the number of episodes it returned, the listing is
   * incomplete and this throws rather than risk reporting a false "not found".
   *
   * @param {string} showId - The show ID.
   * @param {number|string} episodeNumber - The episode number to look for.
   * @returns {Promise<Object|null>} The matching episode, or null if none exists.
   * @throws {CaptivateApiError} If a listing fails or appears incomplete.
   */
  async findEpisodeByNumber(showId, episodeNumber) {
    const sdkMethod = "findEpisodeByNumber";
    requireParams(sdkMethod, { showId, episodeNumber });
    const wanted = String(episodeNumber);
    const matches = (episode) =>
      episode &&
      episode.episode_number !== undefined &&
      episode.episode_number !== null &&
      String(episode.episode_number) === wanted;

    const listings = [
      [() => this.listEpisodes(showId), `GET /shows/${showId}/episodes`],
      [() => this.listScheduledEpisodes(showId), `GET /shows/${showId}/episodes/scheduled`],
    ];
    for (const [list, endpoint] of listings) {
      const data = await list();
      const found = data.episodes.find(matches);
      if (found) return found;
      if (typeof data.count === "number" && data.count > data.episodes.length) {
        throw new CaptivateApiError(
          `${sdkMethod}: ${endpoint} returned ${data.episodes.length} of ${data.count} episodes; ` +
            "cannot confirm the episode number is unused",
          { method: sdkMethod, endpoint, status: null, responseBody: { count: data.count } }
        );
      }
    }
    return null;
  }

  /**
   * Creates a new episode.
   *
   * `publishDate` is sent as Captivate's `date` field and must be formatted
   * `YYYY-MM-DD HH:mm:ss`. Captivate interprets it in the **show's time zone**
   * (the show's `time_zone` setting), not UTC. The SDK does no time-zone
   * conversion.
   *
   * Scheduling is driven by `publishDate`, not `status`:
   * - future date, no status: the episode is scheduled for that time.
   * - past or current date, no status: the episode goes live now (if it has media).
   * - `status: "Draft"`: the episode is saved as a draft regardless of date.
   *
   * @param {Object} params
   * @param {string} params.showId - Required.
   * @param {string} params.title - Required. Also sent as `itunes_title`.
   * @param {string} params.mediaId - Required. From `uploadEpisode`.
   * @param {string} params.publishDate - Required. `YYYY-MM-DD HH:mm:ss` in the show's time zone.
   * @param {number} params.episodeNumber - Required.
   * @param {string} [params.showNotes] - Max 4,000 characters.
   * @param {string} [params.summary] - Max 4,000 characters.
   * @param {string} [params.episodeType] - "full", "trailer", or "bonus".
   * @param {string} [params.subtitle] - Max 255 characters.
   * @param {string} [params.author] - Max 255 characters.
   * @param {boolean|string} [params.explicit] - true sends "explicit", false sends "clean". Omit to use the show's setting.
   * @param {string} [params.status] - "Draft" to save a draft. Omit to schedule or publish by date.
   * @param {number} [params.episodeSeason]
   * @param {string} [params.donationLink]
   * @param {string} [params.donationText]
   * @param {string} [params.episodeUrl] - Sent as `link`; must be a URL.
   * @param {string} [params.episodeArt] - Artwork URL.
   * @param {boolean} [params.itunesBlock] - Sent as "true" or "false".
   * @returns {Promise<Object>} The response data; the new episode is at `record`.
   * @throws {TypeError} If a required field is missing or publishDate is malformed.
   * @throws {CaptivateApiError} If the request fails or the response has no `record.id`.
   */
  async createEpisode(params) {
    const sdkMethod = "createEpisode";
    if (!params || typeof params !== "object") {
      throw new TypeError(`${sdkMethod}: params object is required`);
    }
    const { showId, title, mediaId, publishDate, episodeNumber } = params;
    requireParams(sdkMethod, { showId, title, mediaId, publishDate, episodeNumber });
    validatePublishDate(sdkMethod, publishDate);

    const response = await this._request(sdkMethod, {
      method: "post",
      path: "/episodes",
      data: () => episodeForm(params),
    });
    const record = response.data && response.data.record;
    if (!record || !record.id) {
      throw this._missingField(sdkMethod, "POST /episodes", "record.id", response);
    }
    return response.data;
  }

  /**
   * Updates an existing episode. Takes the same fields as `createEpisode`;
   * only the fields you pass are sent.
   *
   * Captivate does not document whether omitted fields are left unchanged, so
   * pass every field you want the episode to keep (fetch it with `getEpisode`
   * first if needed) until you have confirmed partial updates are safe.
   *
   * @param {string} episodeId - The episode ID.
   * @param {Object} fields - Same field names as `createEpisode`.
   * @returns {Promise<Object>} The response data.
   * @throws {TypeError} If episodeId or fields is missing, or publishDate is malformed.
   * @throws {CaptivateApiError} If the request fails.
   */
  async updateEpisode(episodeId, fields) {
    const sdkMethod = "updateEpisode";
    requireParams(sdkMethod, { episodeId });
    if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
      throw new TypeError(`${sdkMethod}: fields object with at least one field is required`);
    }
    if (fields.publishDate !== undefined && fields.publishDate !== null) {
      validatePublishDate(sdkMethod, fields.publishDate);
    }

    const response = await this._request(sdkMethod, {
      method: "put",
      path: `/episodes/${episodeId}`,
      data: () => episodeForm(fields),
    });
    return response.data;
  }

  // ─── Analytics / Insights ───────────────────────────────────────────

  async _getData(sdkMethod, request) {
    const response = await this._request(sdkMethod, request);
    return response.data;
  }

  /**
   * Gets an overview of analytics for a show within a date range.
   *
   * @param {string} showId - The show ID.
   * @param {string} start - Start date (YYYY-MM-DD).
   * @param {string} end - End date (YYYY-MM-DD).
   * @param {boolean} [includeTopEpisodes=true] - Include top episodes in the response.
   * @returns {Promise<Object>} Overview analytics data.
   */
  async getAnalyticsOverview(showId, start, end, includeTopEpisodes = true) {
    requireParams("getAnalyticsOverview", { showId, start, end });
    return this._getData("getAnalyticsOverview", {
      method: "get",
      path: `/insights/${showId}/overview`,
      params: { start, end, includeTopEpisodes },
    });
  }

  /**
   * Gets an overview of analytics for a specific episode within a date range.
   *
   * @param {string} showId - The show ID.
   * @param {string} episodeId - The episode ID.
   * @param {string} start - Start date (YYYY-MM-DD).
   * @param {string} end - End date (YYYY-MM-DD).
   * @returns {Promise<Object>} Episode overview analytics data.
   */
  async getEpisodeAnalyticsOverview(showId, episodeId, start, end) {
    requireParams("getEpisodeAnalyticsOverview", { showId, episodeId, start, end });
    return this._getData("getEpisodeAnalyticsOverview", {
      method: "get",
      path: `/insights/${showId}/overview/${episodeId}`,
      params: { start, end },
    });
  }

  /**
   * Gets average analytics for a show over a given interval.
   *
   * @param {string} showId - The show ID.
   * @param {number} [intervalDays=28] - Number of days for the averaging interval.
   * @returns {Promise<Object>} Average analytics data.
   */
  async getAnalyticsAverages(showId, intervalDays = 28) {
    requireParams("getAnalyticsAverages", { showId });
    return this._getData("getAnalyticsAverages", {
      method: "get",
      path: `/insights/${showId}/averages`,
      params: { intervalDays },
    });
  }

  /**
   * Gets the all-time total downloads for a show.
   *
   * @param {string} showId - The show ID.
   * @returns {Promise<Object>} Total download data.
   */
  async getAnalyticsTotal(showId) {
    requireParams("getAnalyticsTotal", { showId });
    return this._getData("getAnalyticsTotal", {
      method: "get",
      path: `/insights/${showId}/total`,
    });
  }

  /**
   * Gets the all-time total downloads for a specific episode.
   *
   * @param {string} showId - The show ID.
   * @param {string} episodeId - The episode ID.
   * @returns {Promise<Object>} Episode total download data.
   */
  async getEpisodeAnalyticsTotal(showId, episodeId) {
    requireParams("getEpisodeAnalyticsTotal", { showId, episodeId });
    return this._getData("getEpisodeAnalyticsTotal", {
      method: "get",
      path: `/insights/${showId}/total/${episodeId}`,
    });
  }

  /**
   * Gets month-by-month download analytics for a show.
   *
   * @param {string} showId - The show ID.
   * @returns {Promise<Object>} Monthly analytics data.
   */
  async getAnalyticsMonthly(showId) {
    requireParams("getAnalyticsMonthly", { showId });
    return this._getData("getAnalyticsMonthly", {
      method: "get",
      path: `/insights/${showId}/monthly`,
    });
  }

  /**
   * Gets month-by-month download analytics for a specific episode.
   *
   * @param {string} showId - The show ID.
   * @param {string} episodeId - The episode ID.
   * @returns {Promise<Object>} Episode monthly analytics data.
   */
  async getEpisodeAnalyticsMonthly(showId, episodeId) {
    requireParams("getEpisodeAnalyticsMonthly", { showId, episodeId });
    return this._getData("getEpisodeAnalyticsMonthly", {
      method: "get",
      path: `/insights/${showId}/monthly/${episodeId}`,
    });
  }

  /**
   * Gets analytics for a show within a custom date range with breakdowns.
   *
   * @param {string} showId - The show ID.
   * @param {Object} params - Range query parameters.
   * @param {string} params.start - Start date.
   * @param {string} params.end - End date.
   * @param {string} [params.interval='1d'] - Aggregation interval.
   * @param {string} [params.timezone='America/New_York'] - Timezone for date calculations.
   * @param {string|null} [params.countryCode=null] - Country code filter.
   * @param {string[]} [params.types] - Breakdown types (e.g. byLocation, byUserAgentBrowser).
   * @returns {Promise<Object>} Range analytics data.
   */
  async getAnalyticsRange(showId, params) {
    requireParams("getAnalyticsRange", { showId, params });
    return this._getData("getAnalyticsRange", {
      method: "post",
      path: `/insights/${showId}/range`,
      headers: { "Content-Type": "application/json" },
      data: () => params,
    });
  }

  /**
   * Gets analytics for a specific episode within a custom date range.
   *
   * @param {string} showId - The show ID.
   * @param {string} episodeId - The episode ID.
   * @param {Object} params - Range query parameters (same shape as getAnalyticsRange).
   * @returns {Promise<Object>} Episode range analytics data.
   */
  async getEpisodeAnalyticsRange(showId, episodeId, params) {
    requireParams("getEpisodeAnalyticsRange", { showId, episodeId, params });
    return this._getData("getEpisodeAnalyticsRange", {
      method: "post",
      path: `/insights/${showId}/range/${episodeId}`,
      headers: { "Content-Type": "application/json" },
      data: () => params,
    });
  }

  /**
   * Compares analytics between multiple episodes.
   *
   * @param {string} showId - The show ID.
   * @param {Array<{id: string, title: string, published_date: string}>} episodes - Episodes to compare.
   * @returns {Promise<Object>} Comparison analytics data.
   */
  async getAnalyticsComparison(showId, episodes) {
    requireParams("getAnalyticsComparison", { showId, episodes });
    return this._getData("getAnalyticsComparison", {
      method: "post",
      path: `/insights/${showId}/compare`,
      headers: { "Content-Type": "application/json" },
      data: () => episodes,
    });
  }

  /**
   * Gets web player analytics for a specific episode.
   *
   * @param {string} showId - The show ID.
   * @param {string} episodeId - The episode ID.
   * @param {Object} params - Web player query parameters.
   * @param {Object} params.dateRange - Date range with gte and lte properties.
   * @param {string} [params.duration] - Duration filter.
   * @param {string} [params.timezone='America/New_York'] - Timezone for date calculations.
   * @returns {Promise<Object>} Web player analytics data.
   */
  async getWebPlayerAnalytics(showId, episodeId, params) {
    requireParams("getWebPlayerAnalytics", { showId, episodeId, params });
    return this._getData("getWebPlayerAnalytics", {
      method: "post",
      path: `/insights/${showId}/web-player/${episodeId}`,
      headers: { "Content-Type": "application/json" },
      data: () => params,
    });
  }
}

Captivate.CaptivateApiError = CaptivateApiError;

module.exports = Captivate;
module.exports.CaptivateApiError = CaptivateApiError;
module.exports.default = Captivate;
