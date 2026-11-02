export function paymentScriptPolicy(nonce: string) {
  return `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://codedrop.uat.payglocal.in https://codedrop.payglocal.in; object-src 'none'; base-uri 'self'`;
}