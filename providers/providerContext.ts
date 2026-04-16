import axios from "axios";
import { getBaseUrl } from "./getBaseUrl";
import { headers } from "./headers";
import * as cheerio from "cheerio";
import { ProviderContext } from "./types";

export const providerContext: ProviderContext = {
  axios,
  getBaseUrl,
  Aes: null,
  commonHeaders: headers,
  cheerio,
};
