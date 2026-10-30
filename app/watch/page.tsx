import { notFound } from "next/navigation";
import { WatchExperience } from "@/components/WatchExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Watch", robots: { index: false, follow: false } };

export default async function LegacyWatchPage({ searchParams }: { searchParams: Promise<{ slug?: string; episode?: string }> }) {
  const { slug, episode } = await searchParams;
  if (!slug) notFound();
  return <WatchExperience slug={slug} episodeId={episode}/>;
}
