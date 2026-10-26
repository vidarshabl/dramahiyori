import {SearchExperience} from "@/components/Discovery";
import {database} from "@/lib/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function SearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const [genreRows,yearRows,countryRows]=await Promise.all([
  database.prepare("SELECT name FROM genres ORDER BY name").all() as Promise<{name:string}[]>,
  database.prepare("SELECT DISTINCT release_year AS year FROM titles WHERE published=1 AND release_year IS NOT NULL ORDER BY year DESC").all() as Promise<{year:number}[]>,
  database.prepare("SELECT DISTINCT country FROM titles WHERE published=1 AND country<>'' ORDER BY country").all() as Promise<{country:string}[]>
 ]);
 const genres=genreRows.map(x=>x.name),years=yearRows.map(x=>x.year),countries=countryRows.map(x=>x.country);
 const filters=Object.fromEntries(Object.entries(params).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
 return <main className="page-shell discovery-page"><div className="page-heading"><span className="eyebrow">A LITTLE SOMETHING FOR EVERY MOOD</span><h1>Find your next favorite.</h1><p>Search a title, try a mood, or wander around until something finds you.</p></div><SearchExperience initialFilters={filters} genres={genres} countries={countries} years={years}/></main>;
}
