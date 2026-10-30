import { revalidateTag, unstable_cache } from "next/cache";
import { database, getTitle as loadTitle, listHomepageSlides as loadHomepageSlides, listRecentEpisodeReleases as loadEpisodeReleases, listTitles as loadTitles, listWeeklySchedule as loadWeeklySchedule } from "@/lib/db";

const CATALOG_TAG = "public-catalog";
const TITLE_FILTER_KEYS = ["q","genre","country","year","type","status","sort","page","limit","hasSinhalaSubtitles"] as const;

const cachedTitleLists = unstable_cache(
  async (filters: Record<string,string|undefined>) => loadTitles(filters),
  ["public-title-summaries-v1"],
  { revalidate: 3600, tags: [CATALOG_TAG] },
);
const cachedPopularLists = unstable_cache(
  async (filters: Record<string,string|undefined>) => loadTitles(filters),
  ["public-popular-title-summaries-v1"],
  { revalidate: 300, tags: [CATALOG_TAG] },
);
const cachedHomepageSlides = unstable_cache(loadHomepageSlides, ["public-homepage-slides-v1"], {
  revalidate: 3600,
  tags: [CATALOG_TAG],
});
const cachedTitleDetails = unstable_cache(async (slug: string) => loadTitle(slug), ["public-title-detail-v1"], {
  revalidate: 3600,
  tags: [CATALOG_TAG],
});
const cachedBrowseOptions = unstable_cache(async () => {
  const [genreRows,yearRows,countryRows]=await Promise.all([
    database.prepare("SELECT name FROM genres ORDER BY name").all() as Promise<{name:string}[]>,
    database.prepare("SELECT DISTINCT release_year AS year FROM titles WHERE published=1 AND release_year IS NOT NULL ORDER BY year DESC").all() as Promise<{year:number}[]>,
    database.prepare("SELECT DISTINCT country FROM titles WHERE published=1 AND country<>'' ORDER BY country").all() as Promise<{country:string}[]>,
  ]);
  return {genres:genreRows.map(row=>row.name),years:yearRows.map(row=>row.year),countries:countryRows.map(row=>row.country)};
}, ["public-browse-options-v1"], { revalidate: 3600, tags: [CATALOG_TAG] });
const cachedEpisodeReleases = unstable_cache(async (limit:number) => loadEpisodeReleases(limit), ["public-episode-releases-v1"], { revalidate: 300, tags: [CATALOG_TAG] });
const cachedWeeklySchedule = unstable_cache(loadWeeklySchedule, ["public-weekly-schedule-v1"], { revalidate: 300, tags: [CATALOG_TAG] });

export async function listTitles(filters:Record<string,string|undefined>={}) {
  const normalized=Object.fromEntries(TITLE_FILTER_KEYS.map(key=>[key,filters[key]?.trim()||undefined])) as Record<string,string|undefined>;
  if(normalized.q)return loadTitles(normalized);
  return normalized.sort==="popular"?cachedPopularLists(normalized):cachedTitleLists(normalized);
}

export const listHomepageSlides=()=>cachedHomepageSlides();
export const getTitle=(slug:string)=>cachedTitleDetails(slug);
export const listBrowseOptions=()=>cachedBrowseOptions();
export const listRecentEpisodeReleases=(limit=12)=>cachedEpisodeReleases(limit);
export const listWeeklySchedule=()=>cachedWeeklySchedule();
export function invalidatePublicCatalogCache(){revalidateTag(CATALOG_TAG);}
