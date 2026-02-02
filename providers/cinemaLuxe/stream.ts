import { Stream, ProviderContext } from "../types";

export const getStream = async ({
  link,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> => {
  try {
    let newLink = link;
    console.log("getStream 1", link);
    if (link.includes("linkstore")) {
      console.log("linkstore detected");
      const res = await fetch(link, {
        signal,
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "en-US,en;q=0.9,en-IN;q=0.8",
          "cache-control": "no-cache",
          pragma: "no-cache",
          priority: "u=0, i",
          "sec-ch-ua":
            '"Microsoft Edge";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          cookie:
            "PHPSESSID=9o57cff841dqtv8djtn1rp1712; ext_name=ojplmecpdpgccookcobabopnaifgidhf",
        },
      });
      const html = await res.text();
      const refreshMetaMatch = html.match(
        /<meta\s+http-equiv="refresh"\s+content="[^"]*url=([^"]+)"/i
      );
      if (refreshMetaMatch && refreshMetaMatch[1]) {
        link = refreshMetaMatch[1];
      }
    } else {
      console.log("linkstore not detected");
    }
    console.log("getStream 2", link);

    if (link.includes("luxedrive")) {
      const res = await providerContext.axios.get(link, { signal });
      const $ = providerContext.cheerio.load(res.data);
      const hubcloudLink = $("a.btn.hubcloud").attr("href");
      if (hubcloudLink) {
        newLink = hubcloudLink;
      } else {
        const gdFlixLink = $("a.btn.gdflix").attr("href");
        if (gdFlixLink) {
          newLink = gdFlixLink;
        }
      }
    }
    if (newLink.includes("flix")) {
      const sreams = await providerContext.extractors.gdFlixExtracter(
        newLink,
        signal
      );
      return sreams;
    }
    const res2 = await providerContext.axios.get(newLink, { signal });
    const data2 = res2.data;
    const hcLink = data2.match(/location\.replace\('([^']+)'/)?.[1] || newLink;
    const hubCloudLinks = await providerContext.extractors.hubcloudExtracter(
      hcLink.includes("https://hubcloud") ? hcLink : newLink,
      signal
    );
    return hubCloudLinks;
  } catch (err) {
    console.error(err);
    return [];
  }
};
