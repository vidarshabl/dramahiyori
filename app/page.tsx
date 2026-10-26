import {FeaturedHero,ContinueWatching,MoodGrid} from "@/components/HomeExperience";
import {MediaRail} from "@/components/MediaRail";
import {listTitles} from "@/lib/db";
import {moods} from "@/lib/demo-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function HomePage(){
 const all=listTitles({limit:"48"});
 const featured=all.filter(t=>t.featured===1).slice(0,3);
 const heroItems=[...featured,...all.filter(t=>!featured.some(f=>f.id===t.id))].slice(0,3);
 const popular=listTitles({sort:"popular"});
 return <main>
  <FeaturedHero items={heroItems.length?heroItems:all.slice(0,3)}/>
  <div className="home-content"><ContinueWatching/>
   {popular.length>0?<MediaRail title="Trending now" eyebrow="BASED ON RECENT VIEWING ACTIVITY" items={popular.slice(0,8)} href="/browse?sort=popular"/>:<MediaRail title="A place to begin" eyebrow="A FEW STORIES TO GET YOU STARTED" items={all.slice(0,6)} href="/browse"/>}
   <MediaRail title="Romantic favorites" eyebrow="THE BUTTERFLIES, ALWAYS" items={listTitles({genre:"Romance"})} href="/browse?genre=Romance"/>
   <MoodGrid moods={moods}/>
   <MediaRail title="Romantic comedies" eyebrow="A SOFT LANDING & A GOOD LAUGH" items={listTitles({genre:"Comedy"})} href="/browse?genre=Comedy"/>
   <MediaRail title="Recently added" eyebrow="FRESHLY TUCKED IN" items={listTitles({sort:"newest"})} href="/new"/>
   <MediaRail title="Ongoing series" eyebrow="A NEW EPISODE, SOON" items={listTitles({type:"series",status:"ongoing"})} href="/browse?type=series&status=ongoing"/>
   <MediaRail title="Completed dramas" eyebrow="READY FOR YOUR NEXT MARATHON" items={listTitles({type:"series",status:"completed"})} href="/browse?type=series&status=completed"/>
   <MediaRail title="Movie night" eyebrow="ONE EVENING, ONE LOVELY STORY" items={listTitles({type:"movie"})} href="/browse?type=movie"/>
   <section className="browse-by"><span className="eyebrow">A SMALL SHORTCUT</span><h2>Find your kind of story</h2><p>Choose a year, country, genre, or whether you want a series or a film.</p><a className="button button-outline" href="/browse">Browse the collection <span>↗</span></a></section>
  </div>
 </main>;
}
