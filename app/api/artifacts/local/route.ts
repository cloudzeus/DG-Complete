import { NextResponse, type NextRequest } from "next/server";
import { getStorage, verifyLocalSignature } from "@/lib/storage";

// Serves artifacts of the local storage driver (dev / single-host) behind a short-lived HMAC
// signature, like Bunny's token URLs. Never cached.
const TYPES: Record<string, string> = { png: "image/png", html: "text/plain; charset=utf-8", json: "application/json" };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const path = q.get("path") ?? "";
  if (!verifyLocalSignature(path, Number(q.get("exp")), q.get("sig") ?? "")) {
    return NextResponse.json({ type: "about:blank", title: "Ο σύνδεσμος έληξε ή δεν είναι έγκυρος.", status: 403 }, { status: 403, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } });
  }
  try {
    const body = await (await getStorage()).get(path);
    const ext = path.split(".").pop() ?? "";
    // DOM snapshots are served as text, never rendered as HTML on our origin.
    return new NextResponse(new Uint8Array(body), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  } catch {
    return NextResponse.json({ type: "about:blank", title: "Το αρχείο δεν βρέθηκε.", status: 404 }, { status: 404, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } });
  }
}
