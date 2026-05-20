/** InstaPay Instant Payment Address shown at checkout. */
export const INSTAPAY_IPA = "gamalelasabdul@instapay";

export const INSTAPAY_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.egyptianbanks.instapay";

export const INSTAPAY_APP_STORE_URL =
  "https://apps.apple.com/app/instapay-egypt/id1592108795";

const ANDROID_PACKAGE = "com.egyptianbanks.instapay";

function isMobileUserAgent(ua: string): boolean {
  return /android|iphone|ipad|ipod/i.test(ua);
}

/**
 * Best-effort link to open InstaPay on mobile (send-money flow).
 * IPA/amount query params are not officially documented; app may still require manual entry.
 */
export function getInstapayTransferHref(amountEgp?: number): string {
  if (typeof navigator === "undefined") {
    return `instapay://send?address=${encodeURIComponent(INSTAPAY_IPA)}`;
  }

  const ua = navigator.userAgent;
  if (!isMobileUserAgent(ua)) {
    return "#";
  }

  const address = encodeURIComponent(INSTAPAY_IPA);
  const amountQ =
    amountEgp != null && amountEgp > 0 ? `&amount=${encodeURIComponent(String(amountEgp))}` : "";

  if (/android/i.test(ua)) {
    const fallback = encodeURIComponent(INSTAPAY_PLAY_STORE_URL);
    return `intent://send?address=${address}${amountQ}#Intent;scheme=instapay;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }

  return `instapay://send?address=${address}${amountQ}`;
}

export function getInstapayStoreHref(): string {
  if (typeof navigator === "undefined") return INSTAPAY_PLAY_STORE_URL;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    ? INSTAPAY_APP_STORE_URL
    : INSTAPAY_PLAY_STORE_URL;
}

export async function copyInstapayAddress(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  await navigator.clipboard.writeText(INSTAPAY_IPA);
  return true;
}
