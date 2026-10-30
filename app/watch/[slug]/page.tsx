import { WatchExperience } from "@/components/WatchExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Watch", robots: { index: false, follow: false } };

export default async function TitleWatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WatchExperience slug={slug}/>;
}
