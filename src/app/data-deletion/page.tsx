import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion | FlowFic",
  description: "Instructions for requesting account and personal data deletion on FlowFic.",
};

export default function DataDeletionPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
        Data Deletion Instructions
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>Last updated: March 1, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>How to request deletion</h2>
        <p>
          If you want to delete your FlowFic account and related personal data, please contact us
          via the in-app support channel and include your account email and the phrase
          &quot;Delete my data&quot;.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>What we delete</h2>
        <p>
          We will process deletion of account-related personal data and content associated with your
          account, subject to legal and security retention requirements.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>Processing time</h2>
        <p>
          We target to complete verified deletion requests within 30 days after identity
          verification.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Need help?</h2>
        <p>
          For questions about privacy and deletion requests, contact us through FlowFic support.
        </p>
      </section>

      <p>
        <Link href="/privacy">Privacy Policy</Link>
      </p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
