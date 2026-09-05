"use client";

import { useEffect, useRef } from "react";
import type { MapPoint } from "@/lib/object-media";
import "leaflet/dist/leaflet.css";

const TEAL = "#42AA9C";

export function ObjectMap({
  points,
  empty = "No mapped locations for this filter set.",
}: {
  points: MapPoint[];
  empty?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !points.length) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !host.current) return;
      map = L.map(host.current, { zoomControl: true, attributionControl: true, preferCanvas: true }).setView([39.5, -98.35], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      for (const point of points) {
        const latlng = L.latLng(point.lat, point.lng);
        bounds.extend(latlng);
        L.circleMarker(latlng, {
          radius: 6,
          color: "#ffffff",
          weight: 1,
          fillColor: TEAL,
          fillOpacity: 0.85,
        })
          .bindPopup(point.name)
          .addTo(map);
      }
      if (points.length === 1) map.setView(bounds.getCenter(), 12);
      else if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
      requestAnimationFrame(() => map?.invalidateSize());
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  if (!points.length) {
    return <div className="px-6 py-16 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  return <div ref={host} className="h-full min-h-[70vh] w-full" />;
}
