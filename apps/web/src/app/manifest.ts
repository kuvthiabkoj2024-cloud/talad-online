import type { MetadataRoute } from "next";

/** PWA manifest so the storefront is installable before native apps ship. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taladonline",
    short_name: "Taladonline",
    description: "Multi-vendor marketplace for local shops in Laos",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2e7d32",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
