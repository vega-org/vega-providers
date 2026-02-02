import { Stream, ProviderContext } from "../types";
import { gdflixExtractor } from "../extractors/gdflix";

export const getStream = async function ({
  link,
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
    const res = await axios.get(link, { signal });
    const data = res.data;
    const $ = cheerio.load(data);
    const streams: Stream[] = [];
    const elements = $(".button2,.button1,.button3,.button4,.button").toArray();
    const promises = elements.map(async (element) => {
      const title = $(element).text();
      let link = $(element).attr("href");
      if (title.includes("GDFLIX") && link) {
        const gdLinks = await gdflixExtractor(
          link,
          signal,
          axios,
          cheerio,
          headers,
        );
        streams.push(...gdLinks);
      }
      const alreadyAdded = streams.find((s) => s.link === link);
      if (
        title &&
        link &&
        !title.includes("Watch") &&
        !title.includes("Login") &&
        !title.includes("GoFile") &&
        !alreadyAdded
      ) {
        streams.push({
          server: title,
          link: link,
          type: "mkv",
        });
      }
    });
    await Promise.all(promises);
    return streams;
  } catch (err) {
    console.error(err);
    return [];
  }
};
