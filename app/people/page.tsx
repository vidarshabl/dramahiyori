import Link from "next/link";
import { RemoteImage } from "@/components/RemoteImage";
import { listCastMembers, listCastProfessions } from "@/lib/db";

export const metadata={title:"Cast & Crew | DearDrama",description:"Browse cast and crew profiles connected to DearDrama titles."};

export default async function PeoplePage({searchParams}:{searchParams:Promise<{q?:string;profession?:string}>}) {
  const params=await searchParams,query=(params.q||"").trim(),profession=(params.profession||"").trim();
  const [people,professions]=await Promise.all([listCastMembers({query,profession}),listCastProfessions()]);
  return <main className="page-shell people-directory">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Cast &amp; crew</span></nav>
    <header className="people-directory-heading"><span className="eyebrow">THE PEOPLE BEHIND THE STORIES</span><h1>Cast <i>&amp;</i> crew</h1><p>Discover the performers and creatives connected to published DearDrama stories.</p>
      <form className="people-directory-filter" action="/people" method="get"><label>Search people<input type="search" name="q" defaultValue={query} placeholder="Name or profession"/></label><label>Profession<select name="profession" defaultValue={profession}><option value="">All professions</option>{professions.map(value=><option key={value} value={value}>{value}</option>)}</select></label><button className="button button-primary">Find people</button>{(query||profession)&&<Link className="button button-glass" href="/people">Clear</Link>}</form>
    </header>
    <section className="people-directory-results" aria-live="polite"><div className="section-heading"><div><span className="eyebrow">A CLOSER LOOK</span><h2>{query||profession?"Search results":"Featured people"}</h2></div><span>{people.length} {people.length===1?"profile":"profiles"}</span></div>
      {people.length?<div className="people-directory-grid">{people.map(person=><Link href={`/people/${person.slug}`} className="people-directory-card" key={person.id}>
        <div className="people-directory-portrait">{person.portrait_url?<RemoteImage src={person.portrait_url} alt={`${person.name} portrait`} sizes="(max-width: 650px) 42vw, (max-width: 1050px) 28vw, 220px" fallbackLabel={person.name}/>:<span aria-label={`${person.name} portrait unavailable`}>✦</span>}</div>
        <div className="people-directory-copy"><strong>{person.name}</strong><span>{person.profession||"Cast & crew"}{person.nationality?` · ${person.nationality}`:""}</span><small>{person.known_for?`Known for ${person.known_for}`:"Published title credits"} · {person.title_count} {person.title_count===1?"title":"titles"}</small></div>
      </Link>)}</div>:<div className="people-directory-empty"><span>✦</span><h2>No profiles found</h2><p>{query||profession?"Try a different name or profession filter.":"Cast profiles appear here after they are connected to a published title."}</p></div>}
    </section>
  </main>;
}
