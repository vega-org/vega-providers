export async function gofileExtractor(
  id: string,
  axios: any,
): Promise<{ link: string; token: string }> {
  try {
    const gofileRes = await axios.get("https://gofile.io/d/" + id);
    const genAccountres = await axios.post("https://api.gofile.io/accounts");
    const token = genAccountres.data.data.token;
    console.log("gofile token", token);

    const wtRes = await axios.get("https://gofile.io/dist/js/global.js");
    const wt = wtRes.data.match(/appdata\.wt\s*=\s*["']([^"']+)["']/)[1];
    console.log("gofile wt", wt);

    const res = await axios.get(
      `https://api.gofile.io/contents/${id}?wt=${wt}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const oId = Object.keys(res.data.data.children)[0];
    console.log("gofileExtractor", res.data.data.children[oId].link);
    const link = res.data.data.children[oId].link;
    return {
      link,
      token,
    };
  } catch (e) {
    console.log("gofileExtractor error", e);
    return {
      link: "",
      token: "",
    };
  }
}
