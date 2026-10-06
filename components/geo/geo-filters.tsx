"use client";

import { useRouter } from "next/navigation";

// Brand / category filters of the map, in the URL (the period picker keeps its own params).

export function GeoFilters({ brands, categories, brand, category }: { brands: string[]; categories: string[]; brand: string; category: string }) {
  const router = useRouter();
  const set = (key: "brand" | "category", value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  };
  const select = "h-9 max-w-56 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Μάρκα" className={select} value={brand} onChange={(e) => set("brand", e.target.value)}>
        <option value="">Όλες οι μάρκες</option>
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select aria-label="Κατηγορία" className={select} value={category} onChange={(e) => set("category", e.target.value)}>
        <option value="">Όλες οι κατηγορίες</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
