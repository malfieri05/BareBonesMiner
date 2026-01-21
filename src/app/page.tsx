import type { ReactElement } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const featureCards = [
  {
    icon: "spark",
    title: "AI Summary",
    description:
      "Transform lengthy videos into 3 crystal-clear sentences that capture the essence.",
  },
  {
    icon: "checklist",
    title: "Action Plan",
    description:
      "Get 3 actionable steps you can implement immediately from every video.",
  },
  {
    icon: "folder",
    title: "Smart Categories",
    description:
      "Auto-organize your clips with AI-powered categorization for easy retrieval.",
  },
];

const featureIcons: Record<string, ReactElement> = {
  spark: (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2l1.8 4.7L18 8l-4.2 1.3L12 14l-1.8-4.7L6 8l4.2-1.3L12 2z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  ),
  checklist: (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6h9" />
      <path d="M4 12h9" />
      <path d="M4 18h9" />
      <path d="M17 6l2 2 3-3" />
      <path d="M17 12l2 2 3-3" />
    </svg>
  ),
  folder: (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
};

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <nav className={styles.nav}>
          <span className={styles.brand}>Value Miner</span>
          <div className={styles.navActions}>
            <Link className={styles.linkButton} href="/auth?mode=signin">
              Sign In
            </Link>
            <Link className={styles.navCta} href="/auth?mode=signup">
              Get Started
            </Link>
          </div>
        </nav>

        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Value Miner</p>
          <h1>
            Turn your doom scroll
            <span> into actionable insights.</span>
          </h1>
          <p className={styles.heroSubhead}>
            Mine value from YouTube Shorts. Get AI-powered summaries and
            action steps from every video you watch.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/auth?mode=signup">
              Get Started Free
            </Link>
            <Link className={styles.secondaryCta} href="/auth?mode=signin">
              Sign In
            </Link>
          </div>
        </section>

        <section className={styles.features}>
          {featureCards.map((card) => (
            <div key={card.title} className={styles.card}>
              <div className={styles.iconWrap} data-icon={card.icon} aria-hidden="true">
                {featureIcons[card.icon]}
              </div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          ))}
        </section>

        <footer className={styles.footer}>
          © 2026 Value Miner. Mine smarter, not harder.
        </footer>
      </main>
    </div>
  );
}
