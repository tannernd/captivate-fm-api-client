const MAX_BODY_LENGTH = 2048;

function truncateBody(body) {
  if (body === undefined || body === null) return null;
  let text;
  if (typeof body === "string") {
    text = body;
  } else if (Buffer.isBuffer(body)) {
    text = body.toString("utf8");
  } else {
    try {
      text = JSON.stringify(body);
    } catch (e) {
      text = String(body);
    }
  }
  return text.length > MAX_BODY_LENGTH
    ? `${text.slice(0, MAX_BODY_LENGTH)}…[truncated]`
    : text;
}

/**
 * Thrown for every failed Captivate API call: HTTP errors, network errors,
 * timeouts, and successful responses that are missing a field the SDK needs.
 */
class CaptivateApiError extends Error {
  /**
   * @param {string} message
   * @param {Object} details
   * @param {string} details.method - SDK method name, e.g. "uploadEpisode".
   * @param {string} details.endpoint - HTTP method and path, e.g. "POST /shows/123/media".
   * @param {number|null} [details.status] - HTTP status, or null if no response was received.
   * @param {*} [details.responseBody] - Response body; stored as a string truncated to ~2 KB.
   * @param {Error} [details.cause] - The original error.
   */
  constructor(message, { method, endpoint, status = null, responseBody = null, cause } = {}) {
    super(message);
    this.name = "CaptivateApiError";
    this.method = method;
    this.endpoint = endpoint;
    this.status = status;
    this.responseBody = truncateBody(responseBody);
    if (cause !== undefined) this.cause = cause;
  }

  static fromRequestError(method, endpoint, error) {
    const response = error && error.response;
    const status = response && typeof response.status === "number" ? response.status : null;
    const reason = status !== null
      ? `HTTP ${status}`
      : (error && (error.code || error.message)) || "request failed";
    return new CaptivateApiError(`${method}: ${endpoint} failed (${reason})`, {
      method,
      endpoint,
      status,
      responseBody: response ? response.data : null,
      cause: error,
    });
  }
}

module.exports = { CaptivateApiError, truncateBody };
