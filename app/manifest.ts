import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "KVERSE — Korean Drama Stories", short_name: "KVERSE", description: "Discover and save Korean drama stories.", start_url: "/", display: "standalone", background_color: "#08080D", theme_color: "#08080D", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
