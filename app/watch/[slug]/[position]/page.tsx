import { WatchExperience } from "@/components/WatchExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Watch episode", robots: { index: false, follow: false } };

export default async function EpisodeWatchPage({ params }: { params: Promise<{ slug: string; position: string }> }) {
  const { slug, position } = await params;
  return <WatchExperience slug={slug} position={position}/>;
}
