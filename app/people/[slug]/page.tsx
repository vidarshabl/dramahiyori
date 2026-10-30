import Link from "next/link";
import {notFound} from "next/navigation";
import {getCastMember} from "@/lib/db";
import type {GalleryImage} from "@/lib/db";
import {MediaGallery} from "@/components/MediaGallery";
import {RemoteImage} from "@/components/RemoteImage";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const person=await getCastMember(slug);
  return person?{title:person.name+" · Cast & crew",description:person.biography.slice(0,160),openGraph:{title:person.name+" · KVERSE",images:person.portrait_url?[person.portrait_url]:[]}}:{title:"Profile not found"};
}

export default async function CastProfilePage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const person=await getCastMember(slug);
  if(!person)notFound();
  const credits=person.credits||[];
  return <main className="person-page page-shell">
    <Link className="back-link" href="/browse">← Back to explore</Link>
    <section className="person-hero">
      <div className="person-portrait">{person.portrait_url?<RemoteImage fill priority src={person.portrait_url} alt={person.name+" portrait"} sizes="(max-width: 650px) 42vw, 280px" fallbackLabel={person.name}/>:<span aria-hidden="true">✦</span>}</div>
      <div className="person-copy"><span className="eyebrow">CAST &amp; CREW PROFILE</span><h1>{person.name}</h1><div className="person-facts">{person.profession&&<span>{person.profession}</span>}{person.profession&&person.nationality&&<i>·</i>}{person.nationality&&<span>{person.nationality}</span>}</div>{person.biography&&<p>{person.biography}</p>}</div>
    </section>

    {credits.length>0&&<section className="person-section"><div className="section-heading"><div><span className="eyebrow">SELECTED CREDITS</span><h2>Credits</h2></div></div><div className="person-filmography">{credits.map(credit=><Link href={"/title/"+credit.title_slug} className="person-credit" key={credit.id}>
      <div className="person-credit-poster">{credit.poster_url?<RemoteImage fill src={credit.poster_url} alt={credit.title+" poster"} sizes="(max-width: 650px) 27vw, 130px" fallbackLabel={credit.title}/>:<span aria-hidden="true">✦</span>}</div>
      <div><strong>{credit.title}</strong><span>{credit.release_year?`${credit.release_year} · `:""}{credit.title_type==="movie"?"Film":"Series"}</span><small>{credit.role_type==="cast"?(credit.character_name||"Cast"):credit.role_type}</small></div>
    </Link>)}</div></section>}

    {person.gallery&&person.gallery.length>0&&<section className="person-section"><div className="section-heading"><div><span className="eyebrow">PORTRAITS &amp; MOMENTS</span><h2>Photos</h2></div></div><MediaGallery images={person.gallery as GalleryImage[]} label={person.name+" photos"}/></section>}
  </main>;
}
