import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUser} from "@/lib/auth";
import {database} from "@/lib/db";
import {listTitles} from "@/lib/catalog";
import {ResultsGrid} from "@/components/HomeExperience";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Your watchlist",robots:{index:false,follow:false}};
export default async function WatchlistPage(){const user=await currentUser();if(!user)redirect("/login?next=%2Fwatchlist");const [rows,all]=await Promise.all([database.prepare("SELECT title_id FROM watchlist_items WHERE user_id=? ORDER BY created_at DESC").all(user.id) as Promise<{title_id:string}[]>,listTitles({limit:"48"})]);const ids=rows.map(x=>x.title_id);const map=new Map(all.map(x=>[x.id,x]));const items=ids.map(id=>map.get(id)).filter(Boolean) as typeof all;return <main className="page-shell"><div className="page-heading"><span className="eyebrow">SAVED FOR A RAINY EVENING</span><h1>Your watchlist.</h1><p>Stories you want to come back to.</p></div><ResultsGrid items={items} initialSaved empty="Your watchlist is still a little quiet."/><div className="watchlist-discovery"><Link href="/browse" className="button button-outline">Find a story <span>↗</span></Link></div></main>}
