// Single service-worker registration wrapper. Never registers in dev, preview or iframes.
const SW_URL = "/sw.js";

function refused() {
  if (!import.meta.env.PROD) return true;
  try { if (window.self !== window.top) return true; } catch { return true; }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (h === d || h.endsWith("." + d)) return true;
  }
  return new URLSearchParams(window.location.search).get("sw") === "off";
}

export async function setupServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith(SW_URL) || r.installing?.scriptURL.endsWith(SW_URL) || r.waiting?.scriptURL.endsWith(SW_URL)).map((r) => r.unregister()));
    return;
  }
  try { await navigator.serviceWorker.register(SW_URL, { scope: "/" }); } catch { /* ignore */ }
}
