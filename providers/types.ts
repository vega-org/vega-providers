import { AxiosStatic } from "axios";
import * as cheerio from "cheerio";

// Content type for providers (replaces zustand import)
export interface Content {
  provider: string;
  [key: string]: any;
}

// getPosts
export interface Post {
  title: string;
  link: string;
  image: string;
  provider?: string;
}

export type TextTracks = {
  title: string;
  language: string;
  type: "application/x-subrip" | "application/ttml+xml" | "text/vtt";
  uri: string;
}[];

// getStream
export interface Stream {
  server: string;
  link: string;
  type: string;
  quality?: "360" | "480" | "720" | "1080" | "2160";
  subtitles?: TextTracks;
  headers?: any;
}

// getInfo
export interface Info {
  title: string;
  image: string;
  synopsis: string;
  imdbId: string;
  type: string;
  tags?: string[];
  cast?: string[];
  rating?: string;
  linkList: Link[];
}
// getEpisodeLinks
export interface EpisodeLink {
  title: string;
  link: string;
}

export interface Link {
  title: string;
  quality?: string;
  episodesLink?: string;
  directLinks?: {
    title: string;
    link: string;
    type?: "movie" | "series";
  }[];
}

// catalog
export interface Catalog {
  title: string;
  filter: string;
}

export interface ProviderType {
  searchFilter?: string;
  catalog: Catalog[];
  genres: Catalog[];
  blurImage?: boolean;
  nonStreamableServer?: string[];
  nonDownloadableServer?: string[];
  GetStream: ({
    link,
    type,
    signal,
    providerContext,
  }: {
    link: string;
    type: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Stream[]>;
  GetHomePosts: ({
    filter,
    page,
    providerValue,
    signal,
    providerContext,
  }: {
    filter: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Post[]>;
  GetEpisodeLinks?: ({
    url,
    providerContext,
  }: {
    url: string;
    providerContext: ProviderContext;
  }) => Promise<EpisodeLink[]>;
  GetMetaData: ({
    link,
    provider,
    providerContext,
  }: {
    link: string;
    provider: Content["provider"];
    providerContext: ProviderContext;
  }) => Promise<Info>;
  GetSearchPosts: ({
    searchQuery,
    page,
    providerValue,
    signal,
    providerContext,
  }: {
    searchQuery: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
    providerContext: ProviderContext;
  }) => Promise<Post[]>;
}

export type ProviderContext = {
  axios: AxiosStatic;
  Aes: any; // AES encryption utility, if used
  getBaseUrl: (providerValue: string) => Promise<string>;
  commonHeaders: Record<string, string>;
  cheerio: typeof cheerio;
};
