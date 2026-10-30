import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUser} from "@/lib/auth";
import {listWatchlistTitles} from "@/lib/db";
import {ResultsGrid} from "@/components/HomeExperience";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Your watchlist",robots:{index:false,follow:false}};
export default async function WatchlistPage(){const user=await currentUser();if(!user)redirect("/login?next=%2Fwatchlist");const items=await listWatchlistTitles(user.id);return <main className="page-shell"><div className="page-heading"><span className="eyebrow">SAVED FOR A RAINY EVENING</span><h1>Your watchlist.</h1><p>Stories you want to come back to.</p></div><ResultsGrid items={items} initialSaved empty="Your watchlist is still a little quiet."/><div className="watchlist-discovery"><Link href="/browse" className="button button-outline">Find a story <span>↗</span></Link></div></main>}
