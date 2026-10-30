import {listRecentEpisodeReleases,listTitles} from "@/lib/catalog";
import {MediaCard} from "@/components/MediaRail";
import {EpisodeReleaseRail} from "@/components/EpisodeReleaseRail";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function NewPage(){const [items,releases]=await Promise.all([listTitles({sort:"newest",limit:"48"}),listRecentEpisodeReleases(24)]);return <main className="page-shell"><div className="page-heading"><span className="eyebrow">JUST ARRIVED</span><h1>New chapters.</h1><p>Recently added titles and newly released episodes.</p></div><EpisodeReleaseRail items={releases}/><h2 className="new-titles-heading">Recently added stories</h2><div className="results-grid">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div>{!items.length&&!releases.length&&<div className="empty-state"><h2>No new stories just yet.</h2></div>}</main>}
