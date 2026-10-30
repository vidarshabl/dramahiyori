import { TitleRequestForm } from "@/components/TitleRequestForm";

export default function RequestTitlePage() {
  return <main className="page-shell info-page"><span className="eyebrow">A STORY YOU’RE LOOKING FOR</span><h1>Request a title</h1><p>Suggest a drama or movie for the catalog. Requests are reviewed by the site administrator; a request is not a promise to add or stream a title.</p><TitleRequestForm/></main>;
}
