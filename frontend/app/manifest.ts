import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DayFit — 하루 일정·데일리 루틴 관리",
    short_name: "DayFit",
    description: "Fit your day, find your rhythm. 일정·데일리 루틴·타임테이블을 한 곳에서.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f4ef",
    theme_color: "#3e6f68",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
