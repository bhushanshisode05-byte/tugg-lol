/** Hosting country takes precedence over the time-zone fallback. */
export function countryFromHeaders(headers: Headers): string | null {
  for (const name of ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code"]) {
    const country = headers.get(name)?.trim().toUpperCase();
    if (country && /^[A-Z]{2}$/.test(country) && country !== "XX") return country;
  }
  return null;
}

export function showTikTok(country: string | null | undefined, timeZone?: string): boolean {
  if (country) return country.toUpperCase() !== "IN";
  return timeZone !== "Asia/Kolkata" && timeZone !== "Asia/Calcutta";
}