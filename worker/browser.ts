// One Chromium per worker process, many contexts (docs/06 §7); recycled every 200 contexts.
import { chromium, type Browser, type BrowserContextOptions } from "playwright";

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let contexts = 0;
let open = 0;
const RECYCLE_AFTER = 200;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected() && contexts < RECYCLE_AFTER) return browser;
  if (launching) return launching;
  launching = (async () => {
    const old = browser;
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--disable-dev-shm-usage"],
    });
    contexts = 0;
    // Let the contexts still open on the old browser finish.
    if (old) setTimeout(() => void old.close().catch(() => undefined), open ? 15 * 60_000 : 0);
    return browser;
  })().finally(() => (launching = null));
  return launching;
}

export async function newContext(opts: BrowserContextOptions) {
  const b = await getBrowser();
  contexts++;
  open++;
  const ctx = await b.newContext(opts);
  ctx.on("close", () => open--);
  return ctx;
}

export async function closeBrowser() {
  await browser?.close().catch(() => undefined);
  browser = null;
}
