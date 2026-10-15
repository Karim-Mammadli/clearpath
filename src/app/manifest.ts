import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClearPath Review",
    short_name: "ClearPath",
    description: "Marketing compliance review with an AI pre-reviewer.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0E7C66",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
