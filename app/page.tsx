import {FeaturedHero,ContinueWatching,MoodGrid} from "@/components/HomeExperience";
import {MediaRail} from "@/components/MediaRail";
import {listBrowseOptions,listHomepageSlides,listRecentEpisodeReleases,listTitles} from "@/lib/catalog";
import {moods} from "@/lib/demo-data";
import {EpisodeReleaseRail} from "@/components/EpisodeReleaseRail";
import {headers} from "next/headers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export default async function HomePage(){
 const requestHeaders=await headers();
 const saveDataHint=requestHeaders.get("save-data")?.toLowerCase()==="on";
 const [all,heroSlides,options,releases]=await Promise.all([listTitles({limit:"12"}),listHomepageSlides(),listBrowseOptions(),listRecentEpisodeReleases(10)]);
 const heroItems=heroSlides.length?heroSlides:all.slice(0,1);
 const years=options.years.slice(0,4);
 const [popular,romance,comedy,newest,ongoing,completed,movies,china,variety,...yearRows]=await Promise.all([listTitles({sort:"popular"}),listTitles({genre:"Romance"}),listTitles({genre:"Comedy"}),listTitles({sort:"newest"}),listTitles({type:"series",status:"ongoing"}),listTitles({type:"series",status:"completed"}),listTitles({type:"movie"}),listTitles({country:"China"}),listTitles({type:"variety"}),...years.map(year=>listTitles({year:String(year)}))]);
 return <main>
  <FeaturedHero items={heroItems.length?heroItems:all.slice(0,3)} saveDataHint={saveDataHint}/>
  <div className="home-content"><ContinueWatching/>
   {popular.length>0?<MediaRail title="Trending now" eyebrow="BASED ON RECENT VIEWING ACTIVITY" items={popular.slice(0,8)} href="/browse?sort=popular"/>:<MediaRail title="A place to begin" eyebrow="A FEW STORIES TO GET YOU STARTED" items={all.slice(0,6)} href="/browse"/>}
   <MediaRail title="Ongoing series" eyebrow="A NEW EPISODE, SOON" items={ongoing} href="/browse?type=series&status=ongoing"/>
   <EpisodeReleaseRail items={releases}/>
   <MediaRail title="Romantic favorites" eyebrow="THE BUTTERFLIES, ALWAYS" items={romance} href="/browse?genre=Romance"/>
   <MoodGrid moods={moods}/>
   <MediaRail title="Romantic comedies" eyebrow="A SOFT LANDING & A GOOD LAUGH" items={comedy} href="/browse?genre=Comedy"/>
   <MediaRail title="Recently added" eyebrow="FRESHLY TUCKED IN" items={newest} href="/new"/>
   <MediaRail title="Completed dramas" eyebrow="READY FOR YOUR NEXT MARATHON" items={completed} href="/browse?type=series&status=completed"/>
   <MediaRail title="Movie night" eyebrow="ONE EVENING, ONE LOVELY STORY" items={movies} href="/browse?type=movie"/>
   {china.length>0&&<MediaRail title="Chinese TV series & movies" eyebrow="STORIES FROM CHINA" items={china} href="/browse?country=China"/>}
   {variety.length>0&&<MediaRail title="Variety shows" eyebrow="A DIFFERENT KIND OF FUN" items={variety} href="/browse?type=variety"/>}
   {years.map((year,index)=><MediaRail key={year} title={`${year} collection`} eyebrow="BY YEAR, AT YOUR PACE" items={yearRows[index]||[]} href={`/browse?year=${year}`}/>)}
   <section className="browse-by"><span className="eyebrow">A SMALL SHORTCUT</span><h2>Find your kind of story</h2><p>Choose a year, country, genre, or whether you want a series or a film.</p><a className="button button-outline" href="/browse">Browse the collection <span>↗</span></a><a className="text-link" href="/schedule">See this week’s release schedule ↗</a></section>
  </div>
 </main>;
}
