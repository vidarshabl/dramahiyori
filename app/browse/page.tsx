import {SearchExperience} from "@/components/Discovery";
import {listBrowseOptions} from "@/lib/catalog";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function BrowsePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const {genres,years,countries}=await listBrowseOptions();
 const filters=Object.fromEntries(Object.entries(params).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));
 return <main className="page-shell discovery-page"><div className="page-heading"><span className="eyebrow">THE DEARDRAMA LIBRARY</span><h1>Browse the collection.</h1><p>From the first butterflies to the story that makes you stay.</p></div><SearchExperience initialFilters={filters} genres={genres} countries={countries} years={years}/></main>;
}
