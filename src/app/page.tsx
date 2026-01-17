"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type TranscriptSegment = {
  text: string;
  start?: number;
  duration?: number;
};

type TranscriptResponse = {
  videoId: string;
  transcript: TranscriptSegment[] | string;
  language?: string;
  transcriptType?: string;
  source: string;
};

type AnalysisResponse = {
  analysis: string;
  actionPlan: string[];
};

const exampleUrl = "https://www.youtube.com/shorts/aqz-KE-bpKQ";

function formatSeconds(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--:--";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TranscriptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const transcriptText = useMemo(() => {
    if (!response) return "";
    if (typeof response.transcript === "string") return response.transcript;
    return response.transcript.map((segment) => segment.text).join(" ");
  }, [response]);

  useEffect(() => {
    if (!response || !transcriptText || analysisLoading) return;
    if (analysis) return;

    const runAnalysis = async () => {
      setAnalysisError(null);
      setAnalysisLoading(true);
      try {
        const apiResponse = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcriptText }),
        });
        const payload = await apiResponse.json();
        if (!apiResponse.ok) {
          throw new Error(payload?.error || "Unable to analyze transcript.");
        }
        setAnalysis(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error.";
        setAnalysisError(message);
      } finally {
        setAnalysisLoading(false);
      }
    };

    runAnalysis();
  }, [analysis, analysisLoading, response, transcriptText]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResponse(null);
    setAnalysis(null);
    setAnalysisError(null);

    if (!url.trim()) {
      setError("Paste a YouTube Shorts or video URL to continue.");
      return;
    }

    setLoading(true);
    try {
      const apiResponse = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const payload = await apiResponse.json();
      if (!apiResponse.ok) {
        throw new Error(payload?.error || "Unable to fetch transcript.");
      }

      setResponse(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>YouTube Shorts Transcript</p>
          <h1>Paste a Shorts URL. Get the transcript instantly.</h1>
          <p className={styles.subhead}>
            We fetch public captions first for speed and cost. If none are available,
            the next phase can add audio transcription.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="url">
            YouTube URL
          </label>
          <div className={styles.inputRow}>
            <input
              id="url"
              name="url"
              type="url"
              placeholder={exampleUrl}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              autoComplete="off"
              className={styles.input}
            />
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? "Fetching..." : "Get transcript"}
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>Transcript</h2>
            {response ? (
              <div className={styles.meta}>
                <span>Video: {response.videoId}</span>
                {response.language ? <span>Lang: {response.language}</span> : null}
                {response.transcriptType ? (
                  <span>Type: {response.transcriptType}</span>
                ) : null}
                <span>Source: {response.source}</span>
              </div>
            ) : null}
          </div>
          {!response && !error ? (
            <p className={styles.placeholder}>
              Submit a Shorts URL to see captions here.
            </p>
          ) : null}
          {response ? (
            <div className={styles.transcript}>
              {typeof response.transcript === "string" ? (
                <p>{response.transcript}</p>
              ) : (
                response.transcript.map((segment, index) => (
                  <div key={`${segment.text}-${index}`} className={styles.segment}>
                    <span className={styles.timestamp}>{formatSeconds(segment.start)}</span>
                    <p>{segment.text}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}
          {transcriptText ? (
            <div className={styles.summary}>
              <h3>Full text</h3>
              <p>{transcriptText}</p>
            </div>
          ) : null}
        </section>

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>Analysis + Action Plan</h2>
            <p className={styles.meta}>
              {analysisLoading ? "Generating insights..." : "AI summary and next steps."}
            </p>
          </div>
          {analysisError ? <p className={styles.error}>{analysisError}</p> : null}
          {!analysis && !analysisLoading ? (
            <p className={styles.placeholder}>
              Submit a URL to generate the 3-sentence analysis and 3-step plan.
            </p>
          ) : null}
          {analysis ? (
            <div className={styles.analysis}>
              <div>
                <h3>3-sentence analysis</h3>
                <p>{analysis.analysis}</p>
              </div>
              <div>
                <h3>3-step action plan</h3>
                <ol>
                  {analysis.actionPlan.map((step, index) => (
                    <li key={`${step}-${index}`}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
