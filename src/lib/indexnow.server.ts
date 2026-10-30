import { config } from "./server-utils.server";

export function indexNowKey() {
  const k = (process.env["INDEXNOW_KEY"] || "").replace(/[^a-zA-Z0-9-]/g, "");
  return k.length >= 8 && k.length <= 128 ? k.slice(0, 128) : "";
}

/** Tells IndexNow-enabled search engines which pages changed. Only runs for the real public domain. */
export async function pingIndexNow(paths: string[], fetchImpl: typeof fetch = fetch) {
  const key = indexNowKey();
  const site = config().siteUrl;
  if (!key) return { skipped: "no key" };
  if (!/^https:\/\/(www\.)?tugg\.lol$/.test(site)) return { skipped: "not the public domain" };
  const host = new URL(site).host;
  const urlList = [...new Set(paths)].slice(0, 10000).map((p) => `${site}${p}`);
  try {
    const res = await fetchImpl("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${site}/indexnow.txt`, urlList }),
      signal: AbortSignal.timeout(8000),
    });
    return { status: res.status, urls: urlList.length };
  } catch {
    return { status: 0, urls: urlList.length };
  }
}
