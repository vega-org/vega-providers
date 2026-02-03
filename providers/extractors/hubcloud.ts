const hubcloudDecode = function (value: string) {
  if (value === undefined) {
    return "";
  }
  return atob(value.toString());
};

export async function hubcloudExtractor(
  link: string,
  signal: AbortSignal,
  axios: any,
  cheerio: any,
  headers: Record<string, string>,
) {
  try {
    headers["Cookie"] =
      "ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t; cf_clearance=woQrFGXtLfmEMBEiGUsVHrUBMT8s3cmguIzmMjmvpkg-1770053679-1.2.1.1-xBrQdciOJsweUF6F2T_OtH6jmyanN_TduQ0yslc_XqjU6RcHSxI7.YOKv6ry7oYo64868HYoULnVyww536H2eVI3R2e4wKzsky6abjPdfQPxqpUaXjxfJ02o6jl3_Vkwr4uiaU7Wy596Vdst3y78HXvVmKdIohhtPvp.vZ9_L7wvWdce0GRixjh_6JiqWmWMws46hwEt3hboaS1e1e4EoWCvj5b0M_jVwvSxBOAW5emFzvT3QrnRh4nyYmKDERnY";
    console.log("hubcloudExtractor", link);
    console.log("headers", headers);
    const baseUrl = link.split("/").slice(0, 3).join("/");
    const streamLinks: any[] = [];
    const vLinkRes = await axios(`${link}`, { headers, signal });
    const vLinkText = vLinkRes.data;
    const $vLink = cheerio.load(vLinkText);
    const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
    let vcloudLink =
      hubcloudDecode(vLinkRedirect[1]?.split("r=")?.[1]) ||
      vLinkRedirect[1] ||
      $vLink(".fa-file-download.fa-lg").parent().attr("href") ||
      link;
    console.log("vcloudLink", vcloudLink);
    if (vcloudLink?.startsWith("/")) {
      vcloudLink = `${baseUrl}${vcloudLink}`;
      console.log("New vcloudLink", vcloudLink);
    }
    const vcloudRes = await fetch(vcloudLink, {
      headers,
      signal,
      redirect: "follow",
    });
    const $ = cheerio.load(await vcloudRes.text());
    // console.log('vcloudRes', $.text());

    const linkClass = $(".btn-success.btn-lg.h6,.btn-danger,.btn-secondary");
    for (const element of linkClass) {
      const itm = $(element);
      let link = itm.attr("href") || "";

      switch (true) {
        case link?.includes("pixeld"):
          if (!link?.includes("api")) {
            const token = link.split("/").pop();
            const baseUrl = link.split("/").slice(0, -2).join("/");
            link = `${baseUrl}/api/file/${token}?download`;
          }
          streamLinks.push({ server: "Pixeldrain", link: link, type: "mkv" });
          break;

        case link?.includes(".dev") && !link?.includes("/?id="):
          streamLinks.push({ server: "Cf Worker", link: link, type: "mkv" });
          break;

        case link?.includes("hubcloud") || link?.includes("/?id="):
          try {
            const newLinkRes = await fetch(link, {
              method: "HEAD",
              headers,
              signal,
              redirect: "manual",
            });

            // Check if response is a redirect (301, 302, etc.)
            let newLink = link;
            if (newLinkRes.status >= 300 && newLinkRes.status < 400) {
              newLink = newLinkRes.headers.get("location") || link;
            } else if (newLinkRes.url && newLinkRes.url !== link) {
              // Fallback: check if URL changed (redirect was followed)
              newLink = newLinkRes.url;
            } else {
              newLink = newLinkRes.headers.get("location") || link;
            }
            if (newLink.includes("googleusercontent")) {
              newLink = newLink.split("?link=")[1];
            } else {
              const newLinkRes2 = await fetch(newLink, {
                method: "HEAD",
                headers,
                signal,
                redirect: "manual",
              });

              // Check if response is a redirect
              if (newLinkRes2.status >= 300 && newLinkRes2.status < 400) {
                newLink =
                  newLinkRes2.headers.get("location")?.split("?link=")[1] ||
                  newLink;
              } else if (newLinkRes2.url && newLinkRes2.url !== newLink) {
                // Fallback: URL changed due to redirect
                newLink = newLinkRes2.url.split("?link=")[1] || newLinkRes2.url;
              } else {
                newLink =
                  newLinkRes2.headers.get("location")?.split("?link=")[1] ||
                  newLink;
              }
            }

            streamLinks.push({
              server: "hubcloud",
              link: newLink,
              type: "mkv",
            });
          } catch (error) {
            console.log("hubcloudExtractor error in hubcloud link: ", error);
          }
          break;

        case link?.includes("cloudflarestorage"):
          streamLinks.push({ server: "CfStorage", link: link, type: "mkv" });
          break;

        case link?.includes("fastdl") || link?.includes("fsl."):
          streamLinks.push({ server: "FastDl", link: link, type: "mkv" });
          break;

        case link.includes("hubcdn") && !link.includes("/?id="):
          streamLinks.push({
            server: "HubCdn",
            link: link,
            type: "mkv",
          });
          break;

        default:
          if (link?.includes(".mkv") || link?.includes("?token=")) {
            const serverName =
              link
                .match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)?.[1]
                ?.replace(/\./g, " ") || "Unknown";
            streamLinks.push({ server: serverName, link: link, type: "mkv" });
          }
          break;
      }
    }

    console.log("streamLinks", streamLinks);
    return streamLinks;
  } catch (error: any) {
    console.log("hubcloudExtractor error: ", error?.message || error);
    return [];
  }
}
