import { createServerFn } from "@tanstack/react-start";
import { countryFromHeaders } from "./share-country";

export const getShareCountry = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeaders, setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  return { country: countryFromHeaders(new Headers(getRequestHeaders())) };
});