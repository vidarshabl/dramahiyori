import {SearchExperience} from "@/components/Discovery";
import {database} from "@/lib/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function BrowsePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const [genreRows,yearRows,countryRows]=await Promise.all([
  database.prepare("SELECT name FROM genres ORDER BY name").all() as Promise<{name:string}[]>,
  database.prepare("SELECT DISTINCT release_year AS year FROM titles WHERE published=1 AND release_year IS NOT NULL ORDER BY year DESC").all() as Promise<{year:number}[]>,
  database.prepare("SELECT DISTINCT country FROM titles WHERE published=1 AND country<>'' ORDER BY country").all() as Promise<{country:string}[]>
 ]);
 const genres=genreRows.map(x=>x.name),years=yearRows.map(x=>x.year),countries=countryRows.map(x=>x.country);
 const filters=Object.fromEntries(Object.entries(params).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
 return <main className="page-shell discovery-page"><div className="page-heading"><span className="eyebrow">THE DEARDRAMA LIBRARY</span><h1>Browse the collection.</h1><p>From the first butterflies to the story that makes you stay.</p></div><SearchExperience initialFilters={filters} genres={genres} countries={countries} years={years}/></main>;
}
