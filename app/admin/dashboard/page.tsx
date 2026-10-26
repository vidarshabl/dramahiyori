import {redirect} from "next/navigation";
import {currentAdmin} from "@/lib/auth";
import {AdminDashboard} from "@/components/AdminDashboard";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Admin Studio",robots:{index:false,follow:false}};
export default async function AdminPage(){const admin=await currentAdmin();if(!admin)redirect("/admin/login");return <AdminDashboard name={admin.display_name}/>}
