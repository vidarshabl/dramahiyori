import Link from "next/link";
import {notFound} from "next/navigation";
import {getTitle,listTitles} from "@/lib/db";
import type {CastCredit,GalleryImage} from "@/lib/db";
import {isValidMediaUrl} from "@/lib/security";
import {DetailActions} from "@/components/DetailActions";
import {MediaGallery} from "@/components/MediaGallery";
import {RemoteImage} from "@/components/RemoteImage";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function safeBackdrop(value:string) {
  if(!value||!isValidMediaUrl(value))return "";
  try{return new URL(value).toString();}catch{return "";}
}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const item=await getTitle(slug);
  if(!item)return {title:"Story not found · DearDrama"};
  return {title:item.title+" · DearDrama",description:item.synopsis,openGraph:{title:item.title,description:item.synopsis,images:item.backdrop_url?[item.backdrop_url]:[]}};
}

export default async function TitlePage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const item=await getTitle(slug);
  if(!item)notFound();
  const related=item.genres?.[0]?(await listTitles({genre:item.genres[0],limit:"8"})).filter(title=>title.id!==item.id).slice(0,6):[];
  const episodes=item.seasons?.flatMap(season=>season.episodes)||[];
  const validTitleStream=Boolean(item.video_url&&isValidMediaUrl(item.video_url));
  const firstPlayableEpisode=episodes.find(episode=>Boolean((episode.video_url&&isValidMediaUrl(episode.video_url))||validTitleStream));
  const playable=Boolean(validTitleStream||episodes.some(episode=>episode.video_url&&isValidMediaUrl(episode.video_url)));
  const watchHref="/watch?"+new URLSearchParams({slug:item.slug,...(firstPlayableEpisode?{episode:firstPlayableEpisode.id}:{})}).toString();
  const backdrop=safeBackdrop(item.backdrop_url);

  return <main className="detail-page">
    <section className="detail-hero" aria-hidden="true" style={{backgroundImage:backdrop?`linear-gradient(90deg,rgba(8,8,13,.94),rgba(8,8,13,.62) 52%,rgba(8,8,13,.15)),linear-gradient(0deg,#08080d,transparent 60%),url("${backdrop}")`:`radial-gradient(ellipse at 75% 20%,rgba(232,62,104,.15),transparent 34%),linear-gradient(180deg,#17111d,#08080d)`}}/>
    <div className="detail-main">
      <div className="detail-poster">{item.poster_url?<RemoteImage src={item.poster_url} sizes="(max-width: 640px) 112px, 245px" alt={item.title+" poster"} fallbackLabel={item.title}/>:<div className="detail-poster-fallback" aria-hidden="true">{item.title}</div>}{item.demo===1&&<span>DEARDRAMA SAMPLE</span>}</div>
      <div className="detail-copy">
        <Link href="/browse" className="back-link">← Back to explore</Link>
        <span className="eyebrow detail-eyebrow">{item.type==="movie"?"A DEARDRAMA FILM":"A DEARDRAMA SERIES"}{item.demo===1&&" · SAMPLE RECORD"}</span>
        <h1>{item.title}</h1>
        {item.alternative_title&&<p className="detail-alt">{item.alternative_title}</p>}
        <div className="detail-facts"><span>{item.release_year||"Year not set"}</span><i>·</i><span>{item.country||"Country not set"}</span><i>·</i><span>{item.status==="ongoing"?"Ongoing":item.status==="upcoming"?"Upcoming":"Completed"}</span>{item.runtime_minutes&&<><i>·</i><span>{item.runtime_minutes} min</span></>}{item.content_rating&&<><i>·</i><span>{item.content_rating}</span></>}</div>
        <div className="hero-genres detail-genres">{item.genres?.map(genre=><Link href={"/browse?genre="+encodeURIComponent(genre)} key={genre}>{genre}</Link>)}</div>
        {item.synopsis&&<p className="detail-synopsis">{item.synopsis}</p>}
        {item.demo===1&&<p className="demo-disclaimer">This is an original sample record used to demonstrate the catalog. It has no verified cast, rating, or streaming availability.</p>}
        <DetailActions id={item.id} slug={item.slug} playable={playable} watchHref={watchHref}/>
      </div>
    </div>

    {item.cast?.length>0&&<section className="detail-section cast-section">
      <div className="section-heading"><div><span className="eyebrow">THE PEOPLE BEHIND THE STORY</span><h2>Cast &amp; crew</h2></div></div>
      <div className="cast-grid">{(item.cast as CastCredit[]).map(member=><Link className="cast-card" href={"/people/"+member.slug} key={member.id}>
        <div className="cast-portrait">{member.portrait_url?<RemoteImage src={member.portrait_url} alt={member.name+" portrait"} sizes="(max-width: 650px) 38vw, 150px" fallbackLabel={member.name}/>:<span aria-hidden="true">✦</span>}</div>
        <strong>{member.name}</strong><span className="cast-role">{member.role_type==="cast"?(member.character_name||"Cast"):member.role_type}{member.role_type!=="cast"&&member.character_name?" · "+member.character_name:""}</span>
      </Link>)}</div>
    </section>}

    {item.gallery?.length>0&&<section className="detail-section title-gallery-section">
      <div className="section-heading"><div><span className="eyebrow">A CLOSER LOOK</span><h2>Photos</h2></div></div>
      <MediaGallery images={item.gallery as GalleryImage[]} label={item.title+" gallery"}/>
    </section>}

    {item.type==="series"&&<section className="episode-section">
      <div className="section-heading"><div><span className="eyebrow">THE STORY SO FAR</span><h2>Episodes</h2></div><span className="episode-total">{episodes.length} {episodes.length===1?"episode":"episodes"}</span></div>
      {item.seasons?.map((season:any)=><div className="season-block" key={season.id}><h3>{season.name}</h3><div className="episode-list">{season.episodes.map((episode:any)=>{
        const source=episode.video_url||item.video_url;
        const canPlay=Boolean(source&&isValidMediaUrl(source));
        const details=<><span className="episode-num">{String(episode.episode_number).padStart(2,"0")}</span><span className="episode-play">{canPlay?"▶":"·"}</span><span className="episode-info"><strong>{episode.title}</strong><small>{episode.synopsis||""}</small></span><span className="episode-unavailable">{canPlay?"Watch episode":"Not streaming"}</span></>;
        return canPlay?<Link className="episode-row" href={"/watch?slug="+item.slug+"&episode="+episode.id} key={episode.id}>{details}</Link>:<div className="episode-row episode-row-unavailable" key={episode.id}>{details}</div>;
      })}</div></div>)}
    </section>}

    {related.length>0&&<section className="detail-related"><div className="section-heading"><div><span className="eyebrow">IF YOU LIKED THIS FEELING</span><h2>More like this</h2></div></div><div className="media-rail">{related.map(title=><Link href={"/title/"+title.slug} key={title.id} className="related-card">{title.poster_url?<div className="related-poster"><RemoteImage src={title.poster_url} alt={title.title+" poster"} sizes="145px" fallbackLabel={title.title}/></div>:<span className="related-fallback">{title.title}</span>}<strong>{title.title}</strong></Link>)}</div></section>}
  </main>;
}
