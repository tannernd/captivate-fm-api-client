/// <reference types="node" />
import { Readable } from "stream";

declare namespace Captivate {
  /** File path, in-memory Buffer, or readable stream. */
  type UploadInput = string | Buffer | Readable;

  interface UploadOptions {
    /** Multipart filename. Required for Buffer and stream input; defaults to the file's basename for paths. */
    filename?: string;
    /** Multipart content type. Defaults to audio/mpeg for media, image/png or image/jpeg for artwork. */
    contentType?: string;
  }

  interface CaptivateOptions {
    /** Defaults to "https://api.captivate.fm". */
    apiBase?: string;
    /** Timeout for regular requests in ms. Defaults to 60000. */
    timeoutMs?: number;
    /** Timeout for media and artwork uploads in ms. Defaults to 600000. */
    uploadTimeoutMs?: number;
  }

  interface EpisodeFields {
    showId?: string;
    title?: string;
    mediaId?: string;
    /** "YYYY-MM-DD HH:mm:ss", interpreted by Captivate in the show's time zone. */
    publishDate?: string;
    episodeNumber?: number | string;
    showNotes?: string;
    summary?: string;
    episodeType?: "full" | "trailer" | "bonus" | (string & {});
    subtitle?: string;
    author?: string;
    /** true sends "explicit", false sends "clean"; strings are sent as-is. */
    explicit?: boolean | string | null;
    /** "Draft" saves a draft. Omit to schedule (future date) or publish (past date). */
    status?: "Draft" | (string & {}) | null;
    episodeSeason?: number | string | null;
    donationLink?: string | null;
    donationText?: string | null;
    episodeUrl?: string | null;
    episodeArt?: string | null;
    itunesBlock?: boolean | null;
  }

  interface CreateEpisodeParams extends EpisodeFields {
    showId: string;
    title: string;
    mediaId: string;
    publishDate: string;
    episodeNumber: number | string;
  }

  interface Episode {
    id: string;
    shows_id?: string;
    title?: string;
    episode_number?: number | string | null;
    status?: string;
    published_date?: string;
    [key: string]: unknown;
  }

  interface EpisodeList {
    episodes: Episode[];
    count?: number;
    [key: string]: unknown;
  }

  interface CreateEpisodeResponse {
    success?: boolean;
    record: { id: string; [key: string]: unknown };
    [key: string]: unknown;
  }

  interface UploadArtworkResult {
    url: string;
    raw: any;
  }

  interface CaptivateApiErrorDetails {
    method: string;
    endpoint: string;
    status?: number | null;
    responseBody?: unknown;
    cause?: unknown;
  }

  class CaptivateApiError extends Error {
    constructor(message: string, details: CaptivateApiErrorDetails);
    readonly name: "CaptivateApiError";
    /** SDK method name, e.g. "uploadEpisode". */
    method: string;
    /** HTTP method and path, e.g. "POST /shows/123/media". */
    endpoint: string;
    /** HTTP status, or null when no response was received (network error, timeout) or the response was malformed. */
    status: number | null;
    /** Response body as a string, truncated to about 2 KB, or null. */
    responseBody: string | null;
    /** The original error, if any. */
    cause?: unknown;
  }
}

declare class Captivate {
  constructor(userId: string, apiKey: string, options?: Captivate.CaptivateOptions);

  token: string;
  apiBase: string;
  userId: string;
  apiKey: string;
  timeoutMs: number;
  uploadTimeoutMs: number;

  authenticateUser(): Promise<string>;

  getUserShows(): Promise<any[]>;
  createShowArtwork(input: Captivate.UploadInput, showId: string, options?: Captivate.UploadOptions): Promise<any>;
  uploadArtwork(
    input: Captivate.UploadInput,
    showId: string,
    options?: Captivate.UploadOptions
  ): Promise<Captivate.UploadArtworkResult>;

  uploadEpisode(input: Captivate.UploadInput, showId: string, options?: Captivate.UploadOptions): Promise<string>;

  listEpisodes(showId: string): Promise<Captivate.EpisodeList>;
  listScheduledEpisodes(showId: string): Promise<Captivate.EpisodeList>;
  getEpisode(episodeId: string): Promise<Captivate.Episode>;
  findEpisodeByNumber(showId: string, episodeNumber: number | string): Promise<Captivate.Episode | null>;
  createEpisode(params: Captivate.CreateEpisodeParams): Promise<Captivate.CreateEpisodeResponse>;
  updateEpisode(episodeId: string, fields: Captivate.EpisodeFields): Promise<any>;

  getAnalyticsOverview(showId: string, start: string, end: string, includeTopEpisodes?: boolean): Promise<any>;
  getEpisodeAnalyticsOverview(showId: string, episodeId: string, start: string, end: string): Promise<any>;
  getAnalyticsAverages(showId: string, intervalDays?: number): Promise<any>;
  getAnalyticsTotal(showId: string): Promise<any>;
  getEpisodeAnalyticsTotal(showId: string, episodeId: string): Promise<any>;
  getAnalyticsMonthly(showId: string): Promise<any>;
  getEpisodeAnalyticsMonthly(showId: string, episodeId: string): Promise<any>;
  getAnalyticsRange(showId: string, params: Record<string, unknown>): Promise<any>;
  getEpisodeAnalyticsRange(showId: string, episodeId: string, params: Record<string, unknown>): Promise<any>;
  getAnalyticsComparison(
    showId: string,
    episodes: Array<{ id: string; title?: string; published_date?: string }>
  ): Promise<any>;
  getWebPlayerAnalytics(showId: string, episodeId: string, params: Record<string, unknown>): Promise<any>;
}

export = Captivate;
