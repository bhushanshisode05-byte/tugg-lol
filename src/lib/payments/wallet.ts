export const walletTokenPattern = /^[a-f0-9]{64}$/;
export async function hashWalletToken(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function newWalletToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
