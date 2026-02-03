import axios from "axios";
import { getBaseUrl } from "./getBaseUrl";
import { headers } from "./headers";
import * as cheerio from "cheerio";
import { ProviderContext } from "./types";
import Aes from "react-native-aes-crypto";

export const providerContext: ProviderContext = {
  axios,
  getBaseUrl,
  commonHeaders: headers,
  Aes,
  cheerio,
};
