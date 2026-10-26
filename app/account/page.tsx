import {redirect} from "next/navigation";
import {currentUser} from "@/lib/auth";
import {AccountPanel} from "@/components/AuthForm";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Your account",robots:{index:false,follow:false}};
export default async function AccountPage(){const user=await currentUser();if(!user)redirect("/login?next=%2Faccount");const count=await (await import("@/lib/db")).database.prepare("SELECT COUNT(*) n FROM viewing_history WHERE user_id=?").get(user.id) as {n:number};return <main className="page-shell"><div className="page-heading"><span className="eyebrow">A LITTLE SPACE THAT’S YOURS</span><h1>Your account.</h1><p>{Number(count.n)} recent viewing history entries saved to this account.</p></div><AccountPanel user={user as {display_name:string;email:string}}/></main>}
