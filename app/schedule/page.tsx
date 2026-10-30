import Image from "next/image";
import Link from "next/link";
import { listWeeklySchedule } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

export const metadata = { title: "Weekly release schedule", description: "See when ongoing K-drama episodes arrive each week." };

export default async function SchedulePage() {
  const shows = await listWeeklySchedule();
  const groups = new Map(days.map((day) => [day, shows.filter((show) => show.air_day === day)]));
  return <main className="page-shell schedule-page"><div className="page-heading"><span className="eyebrow">A NEW CHAPTER EACH WEEK</span><h1>Weekly release schedule.</h1><p>Ongoing series, arranged by their listed air day.</p></div>
    <div className="schedule-grid">{days.map((day) => <section className="schedule-day" key={day}><h2>{day}<span>{groups.get(day)?.length || 0}</span></h2>{groups.get(day)?.map((show) => <article className="schedule-show" key={show.id}><Link href={`/title/${encodeURIComponent(show.slug)}`} className="schedule-poster">{show.poster_url&&<Image fill src={show.poster_url} alt="" sizes="80px" loading="lazy"/>}</Link><div><Link href={`/title/${encodeURIComponent(show.slug)}`} className="schedule-title">{show.title}</Link>{show.sinhala_title&&<span lang="si" className="schedule-sinhala">{show.sinhala_title}</span>}<span className="schedule-episode">{show.latest_episode?`Ep ${show.latest_episode}${show.total_episodes?` of ${show.total_episodes}`:""}`:"Episodes coming soon"}</span>{Number(show.has_sinhala_subtitles)===1&&<span className="schedule-subtitles" lang="si">සිංහල උපසිරැසි</span>}</div></article>)}{!groups.get(day)?.length&&<p className="schedule-empty">No listed releases.</p>}</section>)}</div>
    {!shows.length&&<p className="schedule-note">No ongoing shows have an air day set yet. An administrator can add one in the title editor.</p>}
  </main>;
}
