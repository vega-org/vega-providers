import { ProviderContext, Stream } from "../types";

const headers = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Cache-Control": "no-store",
  "Accept-Language": "en-US,en;q=0.9",
  DNT: "1",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export async function getStream({
  link,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}) {
  const { axios, cheerio, extractors } = providerContext;
  const { hubcloudExtracter } = extractors;

  try {
    const streamLinks: Stream[] = [];
    const response = await axios.get(link, { headers });
    const $ = cheerio.load(response.data);

    // --- PixelDrain link scrape ---
    $("a[href*='pixeldrain.dev/api/file/']").each((_, el) => {
      const href = $(el).attr("href")?.trim();
      if (href) {
        streamLinks.push({
          server: "pixeldrain",
          link: href,
          type: "mp4",
        });
      }
    });

    // --- hubcloud extraction ---
    const hubcloudStreams = await hubcloudExtracter(link, signal);
    streamLinks.push(...hubcloudStreams);

    return streamLinks;
  } catch (error: any) {
    console.log("getStream error: ", error);
    return [];
  }
}
