import {SearchExperience} from "@/components/Discovery";
import {database} from "@/lib/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function SearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const genres=(database.prepare("SELECT name FROM genres ORDER BY name").all() as {name:string}[]).map(x=>x.name);
 const years=(database.prepare("SELECT DISTINCT release_year AS year FROM titles WHERE published=1 AND release_year IS NOT NULL ORDER BY year DESC").all() as {year:number}[]).map(x=>x.year);
 const countries=(database.prepare("SELECT DISTINCT country FROM titles WHERE published=1 AND country<>'' ORDER BY country").all() as {country:string}[]).map(x=>x.country);
 const filters=Object.fromEntries(Object.entries(params).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
 return <main className="page-shell discovery-page"><div className="page-heading"><span className="eyebrow">A LITTLE SOMETHING FOR EVERY MOOD</span><h1>Find your next favorite.</h1><p>Search a title, try a mood, or wander around until something finds you.</p></div><SearchExperience initialFilters={filters} genres={genres} countries={countries} years={years}/></main>;
}
