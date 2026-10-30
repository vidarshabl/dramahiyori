import { ReportForm } from "@/components/ReportForm";

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => Array.isArray(params[key]) ? params[key]?.[0] || "" : params[key] || "";
  return <main className="page-shell info-page"><span className="eyebrow">WE TAKE REPORTS SERIOUSLY</span><h1>Report content</h1><p>Tell us about a broken link, subtitle issue, or content concern. Reports go to the site administrator for review.</p><ReportForm targetType={value("targetType")} targetId={value("targetId")}/><p>Do not include passwords, payment details, or other sensitive personal information.</p></main>;
}
