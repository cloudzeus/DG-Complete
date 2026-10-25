import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Mapbox: forward geocoding of customer addresses (Geocoding API v6, permanent=true — Mapbox's
// terms allow storing results only from permanent geocoding) and the raster tiles of the map.

const AAD = "geo_settings:default";

export async function getGeoSettings() {
  return (await prisma.geoSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.geoSettings.create({ data: { id: "default" } }));
}

export const sealMapboxToken = (token: string) => encrypt(token, AAD);

export async function mapboxToken(): Promise<string> {
  const s = await getGeoSettings();
  if (!s.tokenEnc) throw new Error("Δεν έχει οριστεί Mapbox token (Ρυθμίσεις → Χάρτες).");
  return decrypt(s.tokenEnc, AAD);
}

/** The public token for map tiles in the browser (pk.… tokens are meant to be public; restrict it by URL in Mapbox). */
export async function publicMapToken(): Promise<string | null> {
  const s = await getGeoSettings();
  if (!s.enabled || !s.tokenEnc) return null;
  const t = decrypt(s.tokenEnc, AAD);
  return t.startsWith("pk.") ? t : null;
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** address · street · postcode · place · locality … — how precise the match is. */
  precision: string;
  confidence: string | null;
  label: string;
} | null;

export async function geocode(query: string, token: string, opts: { permanent?: boolean } = {}): Promise<GeocodeResult> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("country", "gr");
  url.searchParams.set("language", "el");
  url.searchParams.set("limit", "1");
  if (opts.permanent !== false) url.searchParams.set("permanent", "true");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error_code?: string };
    throw new Error(`Mapbox ${res.status}: ${body.message ?? body.error_code ?? res.statusText}`);
  }
  const body = (await res.json()) as {
    features?: {
      geometry: { coordinates: [number, number] };
      properties: { feature_type?: string; full_address?: string; name?: string; match_code?: { confidence?: string } };
    }[];
  };
  const f = body.features?.[0];
  if (!f) return null;
  return {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    precision: f.properties.feature_type ?? "unknown",
    confidence: f.properties.match_code?.confidence ?? null,
    label: f.properties.full_address ?? f.properties.name ?? query,
  };
}
