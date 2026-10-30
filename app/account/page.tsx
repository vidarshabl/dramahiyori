import {redirect} from "next/navigation";
import {currentUser} from "@/lib/auth";
import {AccountPanel} from "@/components/AuthForm";
import Link from "next/link";
import {RemoteImage} from "@/components/RemoteImage";
import {database} from "@/lib/db";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Your account",robots:{index:false,follow:false}};
export default async function AccountPage(){
  const user=await currentUser();
  if(!user)redirect("/login?next=%2Faccount");
  const [count,history]=await Promise.all([
    database.prepare("SELECT COUNT(*) n FROM viewing_history WHERE user_id=?").get(user.id) as Promise<{n:number}>,
    database.prepare(`SELECT h.id,h.viewed_at,t.slug,t.title,t.poster_url,e.title AS episode_title,e.episode_number,s.season_number
      FROM viewing_history h JOIN titles t ON t.id=h.title_id LEFT JOIN episodes e ON e.id=h.episode_id LEFT JOIN seasons s ON s.id=e.season_id
      WHERE h.user_id=? AND t.published=1 ORDER BY h.viewed_at DESC LIMIT 20`).all(user.id) as Promise<Array<{id:number;viewed_at:string;slug:string;title:string;poster_url:string;episode_title:string|null;episode_number:number|null;season_number:number|null}>>,
  ]);
  return <main className="page-shell"><div className="page-heading"><span className="eyebrow">A LITTLE SPACE THAT’S YOURS</span><h1>Your account.</h1><p>{Number(count.n)} recent viewing history entries saved to this account.</p></div>
    <AccountPanel user={{display_name:user.display_name,email:user.email}}/>
    <section className="account-history" aria-labelledby="account-history-title"><div className="section-heading"><div><span className="eyebrow">THE STORIES YOU’VE VISITED</span><h2 id="account-history-title">Recent viewing history</h2></div></div>
      {history.length?<ol className="account-history-list">{history.map(item=>{const href=item.episode_number&&item.season_number?`/watch/${encodeURIComponent(item.slug)}/${item.season_number}-${item.episode_number}`:`/watch/${encodeURIComponent(item.slug)}`;return <li key={item.id}><Link href={href} className="account-history-link"><span className="account-history-poster">{item.poster_url?<RemoteImage src={item.poster_url} alt="" sizes="64px" fallbackLabel={item.title}/>:<span aria-hidden="true">✦</span>}</span><span className="account-history-copy"><strong>{item.title}</strong><small>{item.episode_title?`Season ${item.season_number||1} · Episode ${item.episode_number} · ${item.episode_title}`:"Movie"}</small><time dateTime={item.viewed_at}>{new Date(item.viewed_at.replace(" ","T")+(/(?:Z|[+-]\d\d:\d\d)$/.test(item.viewed_at)?"":"Z")).toLocaleString()}</time></span><span className="account-history-arrow" aria-hidden="true">↗</span></Link></li>})}</ol>:<div className="empty-state account-history-empty"><span>☾</span><h3>Your viewing history will appear here.</h3><p>Watch a little of a story while signed in to keep it close.</p><Link href="/browse" className="button button-outline">Find a story <span>↗</span></Link></div>}
    </section>
  </main>;
}
