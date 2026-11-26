// מציג עמוד משפטי (תנאי שימוש או מדיניות פרטיות) מתוך הנוסח ב-lib/legal.ts.
import { LEGAL_DRAFT, type LegalSection } from "@/lib/legal";
import { TERMS_VERSION } from "@/lib/authLogic";

export default function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main style={{ maxWidth: "720px", margin: "2rem auto", padding: "0 1rem", lineHeight: 1.7 }}>
      <p style={{ margin: 0 }}>
        <a href="/" style={{ color: "#4f46e5" }}>חזרה ל-cooki</a>
      </p>
      <h1>{title}</h1>
      <p style={{ color: "#6b7280", fontSize: "0.9rem", marginTop: 0 }}>גרסה: {TERMS_VERSION}</p>

      {LEGAL_DRAFT && (
        <p role="note" style={{ padding: "0.6rem 0.8rem", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", color: "#92400e" }}>
          טיוטה: הנוסח הזה טרם נבדק על ידי עורך/ת דין.
        </p>
      )}

      {sections.map((s) => (
        <section key={s.heading}>
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.25rem" }}>{s.heading}</h2>
          {s.paragraphs?.map((p, i) => (
            <p key={i} style={{ margin: "0.4rem 0" }}>{p}</p>
          ))}
          {s.bullets && (
            <ul style={{ margin: "0.4rem 0", paddingInlineStart: "1.4rem" }}>
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}