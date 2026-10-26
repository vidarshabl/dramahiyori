import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUser} from "@/lib/auth";
import {database,listTitles} from "@/lib/db";
import {ResultsGrid} from "@/components/HomeExperience";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Your watchlist",robots:{index:false,follow:false}};
export default async function WatchlistPage(){const user=await currentUser();if(!user)redirect("/login?next=%2Fwatchlist");const ids=(database.prepare("SELECT title_id FROM watchlist_items WHERE user_id=? ORDER BY created_at DESC").all(user.id) as {title_id:string}[]).map(x=>x.title_id);const map=new Map(listTitles({limit:"48"}).map(x=>[x.id,x]));const items=ids.map(id=>map.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof listTitles>[number]>[];return <main className="page-shell"><div className="page-heading"><span className="eyebrow">SAVED FOR A RAINY EVENING</span><h1>Your watchlist.</h1><p>Stories you want to come back to.</p></div><ResultsGrid items={items} empty="Your watchlist is still a little quiet."/><div className="watchlist-discovery"><Link href="/browse" className="button button-outline">Find a story <span>↗</span></Link></div></main>}
