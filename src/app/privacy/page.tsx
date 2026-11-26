import LegalPage from "@/components/LegalPage";
import { PRIVACY_SECTIONS } from "@/lib/legal";

export const metadata = { title: "מדיניות פרטיות | cooki" };

export default function PrivacyPage() {
  return <LegalPage title="מדיניות פרטיות" sections={PRIVACY_SECTIONS} />;
}