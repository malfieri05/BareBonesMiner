import { Suspense } from "react";
import Link from "next/link";
import HomeRedirectClient from "./home-redirect-client";
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

export default function Home() {
  return (
    <div className={styles.page}>
      <Suspense fallback={null}>
        <HomeRedirectClient />
      </Suspense>
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
                <span />
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
