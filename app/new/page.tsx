import {listTitles} from "@/lib/db";
import {MediaCard} from "@/components/MediaRail";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default function NewPage(){const items=listTitles({sort:"newest",limit:"48"});return <main className="page-shell"><div className="page-heading"><span className="eyebrow">JUST ARRIVED</span><h1>New chapters.</h1><p>Recently added stories, sorted from the latest catalog updates.</p></div><div className="results-grid">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div>{!items.length&&<div className="empty-state"><h2>No new stories just yet.</h2></div>}</main>}
