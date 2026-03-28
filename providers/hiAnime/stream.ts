import { Stream, ProviderContext, TextTracks } from "../types";

export const getStream = async function ({
  link: id,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  try {
    const { axios } = providerContext;

    // get episode servers
    const serverRes = await axios.get(
      `https://hianime.to/ajax/v2/episode/servers?episodeId=${id}`
    );

    const servers =
      serverRes?.data?.data?.sub?.map((s: any) => s.serverId) || [];

    const streams: Stream[] = [];

    for (const server of servers) {
      try {
        const linkRes = await axios.get(
          `https://hianime.to/ajax/v2/episode/sources?id=${id}&server=${server}`
        );

        const data = linkRes?.data?.data;

        if (!data?.link) continue;

        streams.push({
          server: server,
          link: data.link,
          type: "m3u8",
          headers: {
            Referer: "https://hianime.to/",
            Origin: "https://hianime.to",
          },
          subtitles: [],
        });
      } catch (e) {}
    }

    return streams;
  } catch (err) {
    return [];
  }
};
