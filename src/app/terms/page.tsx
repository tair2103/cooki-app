import LegalPage from "@/components/LegalPage";
import { TERMS_SECTIONS } from "@/lib/legal";

export const metadata = { title: "תנאי שימוש | cooki" };

export default function TermsPage() {
  return <LegalPage title="תנאי שימוש" sections={TERMS_SECTIONS} />;
}