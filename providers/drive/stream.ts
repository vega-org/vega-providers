import { Stream, ProviderContext } from "../types";
import { hubcloudExtractor } from "../extractors/hubcloud";
import { gdflixExtractor } from "../extractors/gdflix";

export const getStream = async function ({
  link: url,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  const { axios, cheerio, commonHeaders: headers } = providerContext;
  try {
    if (type === "movie") {
      const res = await axios.get(url, { headers });
      const html = res.data;
      const $ = cheerio.load(html);
      const link = $('a:contains("HubCloud")').attr("href");
      url = link || url;
    }

    let redirectUrl = "";
    try {
      const res = await axios.get(url, { headers });
      redirectUrl = res.data.match(
        /<meta\s+http-equiv="refresh"\s+content="[^"]*?;\s*url=([^"]+)"\s*\/?>/i,
      )?.[1];
      if (url.includes("/archives/")) {
        redirectUrl = res.data.match(
          /<a\s+[^>]*href="(https:\/\/hubcloud\.[^\/]+\/[^"]+)"/i,
        )?.[1];
      }
    } catch (err: any) {
      console.error("Hubcloud redirect err", err?.message || err);
    }
    if (!redirectUrl) {
      if (url.includes("hubcloud")) {
        console.log(" hubcloud link found in:", url);
        return await hubcloudExtractor(url, signal, axios, cheerio, headers);
      } else if (url.includes("gdflix")) {
        // handle gdflix links
        console.log("gdflix link found:", url);
        const gdflixStreams = await gdflixExtractor(
          url,
          signal,
          axios,
          cheerio,
          headers,
        );
        return gdflixStreams;
      }
    }
    console.log("redirectUrl", redirectUrl);
    const res2 = await axios.get(redirectUrl, { headers });
    const data = res2.data;
    const $ = cheerio.load(data);
    const hubcloudLink = $(".fa-file-download").parent().attr("href");
    return await hubcloudExtractor(
      hubcloudLink?.includes("https://hubcloud") ? hubcloudLink : redirectUrl,
      signal,
      axios,
      cheerio,
      headers,
    );
  } catch (err: any) {
    console.error("Movies Drive err", err?.message || err);
    return [];
  }
};
