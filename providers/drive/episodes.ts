import { EpisodeLink, ProviderContext } from "../types";

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const { axios, cheerio } = providerContext;
    const res = await axios.get(url);
    const html = res.data;
    let $ = cheerio.load(html);

    const episodeLinks: EpisodeLink[] = [];

    // Try old format first (backward compatibility)
    $('a:contains("HubCloud")').map((i, element) => {
      const title = $(element).parent().prev().text();
      const link = $(element).attr("href");
      if (link && (title.includes("Ep") || title.includes("Download"))) {
        episodeLinks.push({
          title: title.includes("Download") ? "Play" : title,
          link,
        });
      }
    });

    // If old format didn't work, try new format
    if (episodeLinks.length === 0) {
      // Find all anchor tags with href containing streaming services
      const streamingServices = ["hubcloud", "gdflix"];
      let currentTitle = "";

      $('h5 span[style*="color"], h5').each((i, element) => {
        const text = $(element).text().trim();
        // Look for titles that contain quality indicators or episode info
        if (
          text &&
          (text.match(/\d{3,4}p/) ||
            text.includes("Ep") ||
            text.includes("Episode"))
        ) {
          currentTitle = text;

          // Find the next links after this title
          let nextElement = $(element).parent();
          for (let j = 0; j < 10; j++) {
            nextElement = nextElement.next();
            if (!nextElement.length) break;

            const links = nextElement.find("a[href]");
            links.each((k, linkEl) => {
              const href = $(linkEl).attr("href");
              if (
                href &&
                streamingServices.some((service) => href.includes(service))
              ) {
                // Determine server name from URL
                let serverName = "Play";
                if (href.includes("hubcloud")) serverName = "HubCloud";
                else if (href.includes("gdflix")) serverName = "GDFlix";
                else if (href.includes("pixeldrain")) serverName = "Pixeldrain";
                else if (href.includes("fastdl")) serverName = "FastDL";

                const title = currentTitle
                  ? `${currentTitle} - ${serverName}`
                  : serverName;
                episodeLinks.push({ title, link: href });
              }
            });
          }
        }
      });
    }

    // console.log(episodeLinks);
    return episodeLinks.length > 0
      ? episodeLinks
      : [{ title: "Play", link: url }];
  } catch (err) {
    console.error(err);
    return [
      {
        title: "Server 1",
        link: url,
      },
    ];
  }
};
