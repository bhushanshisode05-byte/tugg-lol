import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getResponseHeader, setResponseHeader } from "@tanstack/react-start/server";
import { paymentScriptPolicy } from "./lib/payments/codedrop-policy";

const requestNonce = createIsomorphicFn()
  .server(() => {
    const nonce = crypto.randomUUID();
    const existing = getResponseHeader("Content-Security-Policy");
    // Preserve a stricter hosting policy; CodeDrop will silently redirect if blocked.
    if (!existing) setResponseHeader(import.meta.env.DEV ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", paymentScriptPolicy(nonce));
    return nonce;
  })
  .client(() => document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.content);

export const getRouter = () => {
  const queryClient = new QueryClient();

  const nonce=requestNonce();
  const router = createRouter({
    routeTree,
    ssr: nonce ? { nonce } : {},
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
