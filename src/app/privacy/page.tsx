import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Flow Fic",
  description: "How Flow Fic collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>Last updated: March 1, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. Information We Collect</h2>
        <p>
          We may collect account details, profile data, story content, and usage analytics to
          provide and improve Flow Fic.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. How We Use Information</h2>
        <p>
          We use your information to operate the service, authenticate users, support features,
          maintain security, and communicate important updates.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. Data Sharing</h2>
        <p>
          We do not sell your personal data. We may share data with service providers only as
          needed to run the product (for example, hosting, storage, or authentication).
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>4. Data Retention</h2>
        <p>
          We keep data only as long as necessary for service operations, legal obligations, and
          legitimate business purposes.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>5. Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, or delete your data.
          Contact us to request support.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>6. Contact</h2>
        <p>For privacy inquiries, contact us through the support channel in the app.</p>
      </section>

      <Link href="/">Back to home</Link>
    </main>
  );
}
