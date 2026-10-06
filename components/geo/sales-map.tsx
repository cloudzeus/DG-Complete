"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

// Sales on the map (MapLibre + Mapbox raster tiles): bubbles by revenue or purchase frequency,
// a heatmap, or each customer coloured by the brand he buys most.

export type GeoPoint = {
  trdr: number;
  name: string;
  city: string;
  lat: number;
  lng: number;
  revenue: number;
  documents: number;
  quantity: number;
  brand?: string | null;
};

export type MapMode = "revenue" | "frequency" | "heat" | "brands";

const MODES: { key: MapMode; label: string }[] = [
  { key: "revenue", label: "Τζίρος" },
  { key: "frequency", label: "Συχνότητα αγορών" },
  { key: "heat", label: "Θερμικός χάρτης" },
  { key: "brands", label: "Μάρκες" },
];

const BRAND_COLORS = ["#E31E2A", "#0078D4", "#10A37F", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B"];
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export function SalesMap({ points, token, brands }: { points: GeoPoint[]; token: string; brands: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [mode, setMode] = useState<MapMode>("revenue");
  const [ready, setReady] = useState(false);

  // Top brands get their own colour, the rest «Άλλες».
  const palette = useMemo(() => Object.fromEntries(brands.slice(0, 7).map((b, i) => [b, BRAND_COLORS[i]])), [brands]);
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          ...p,
          brandColor: (p.brand && palette[p.brand]) || BRAND_COLORS[7],
        },
      })),
    }),
    [points, palette],
  );
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));
  const maxDocs = Math.max(1, ...points.map((p) => p.documents));

  useEffect(() => {
    let disposed = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (disposed || !el.current) return;
      const m = new maplibre.Map({
        container: el.current,
        style: {
          version: 8,
          sources: {
            base: {
              type: "raster",
              tiles: [`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`],
              tileSize: 256,
              attribution: "© Mapbox © OpenStreetMap",
            },
          },
          layers: [{ id: "base", type: "raster", source: "base" }],
        },
        center: [23.7, 38.3],
        zoom: 5.6,
        attributionControl: { compact: true },
      });
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        m.addSource("customers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "heat",
          type: "heatmap",
          source: "customers",
          layout: { visibility: "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "revenue"], 0, 0, 1, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 12, 12, 30],
            "heatmap-opacity": 0.85,
          },
        });
        m.addLayer({
          id: "bubbles",
          type: "circle",
          source: "customers",
          paint: { "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.75 },
        });
        const popup = new maplibre.Popup({ closeButton: false, offset: 8 });
        m.on("mousemove", "bubbles", (e: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          m.getCanvas().style.cursor = "pointer";
          const box = document.createElement("div");
          box.style.font = "12px/1.4 system-ui";
          const title = document.createElement("strong");
          title.textContent = String(p.name);
          box.append(title, document.createElement("br"));
          box.append(
            `${p.city} · ${eur(Number(p.revenue))} · ${Number(p.documents).toLocaleString("el-GR")} παραστατικά${p.brand ? ` · κυρίως ${p.brand}` : ""}`,
          );
          popup.setLngLat(e.lngLat).setDOMContent(box).addTo(m);
        });
        m.on("mouseleave", "bubbles", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        setReady(true);
      });
      map.current = m;
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [token]);

  // Data + mode → layers.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("customers") as GeoJSONSource).setData(geojson);
    const heat = mode === "heat";
    m.setLayoutProperty("heat", "visibility", heat ? "visible" : "none");
    m.setLayoutProperty("bubbles", "visibility", heat ? "none" : "visible");
    m.setPaintProperty("heat", "heatmap-weight", ["/", ["get", "revenue"], maxRevenue]);
    const size: ExpressionSpecification =
      mode === "frequency"
        ? ["interpolate", ["linear"], ["sqrt", ["get", "documents"]], 0, 2.5, Math.sqrt(maxDocs), 22]
        : ["interpolate", ["linear"], ["sqrt", ["max", ["get", "revenue"], 0]], 0, 2.5, Math.sqrt(maxRevenue), 24];
    m.setPaintProperty("bubbles", "circle-radius", size);
    m.setPaintProperty("bubbles", "circle-color", mode === "brands" ? ["get", "brandColor"] : mode === "frequency" ? "#0078D4" : "#E31E2A");
    if (points.length) {
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 40, maxZoom: 11, duration: 0 },
      );
    }
  }, [geojson, mode, ready, maxRevenue, maxDocs, points]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-sm transition-colors",
              mode === m.key ? "border-dg-red-300 bg-dg-red-50 font-medium text-dg-red-700" : "hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div ref={el} className="h-[60svh] min-h-96 w-full overflow-hidden rounded-xl border" />
      {mode === "brands" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {[...Object.entries(palette), ["Άλλες", BRAND_COLORS[7]]].map(([b, c]) => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: c }} />
              {b}
            </span>
          ))}
          <span className="text-muted-foreground">· χρώμα = η μάρκα που αγοράζει περισσότερο κάθε πελάτης</span>
        </div>
      )}
      {mode !== "brands" && (
        <p className="text-xs text-muted-foreground">
          {mode === "frequency" ? "Μέγεθος = πλήθος παραστατικών (πόσο συχνά αγοράζει)." : mode === "heat" ? "Ένταση = τζίρος της περιοχής." : "Μέγεθος = τζίρος του πελάτη."}{" "}
          Περάστε τον δείκτη πάνω από έναν πελάτη για λεπτομέρειες.
        </p>
      )}
    </div>
  );
}
