import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LiftLog",
    short_name: "LiftLog",
    description: "Track your lifts and food, and see if you're building muscle while staying lean.",
    start_url: "/workout",
    display: "standalone",
    background_color: "#0a0b0c",
    theme_color: "#0a0b0c",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
