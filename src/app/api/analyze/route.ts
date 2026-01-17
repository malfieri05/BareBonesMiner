import { NextResponse } from "next/server";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const ALLOWED_CATEGORIES = [
  "Business",
  "Health",
  "Mindset",
  "Politics",
  "Religion",
  "Productivity",
  "Other",
];

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY server configuration." },
      { status: 500 }
    );
  }

  let body: { text?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Missing transcript text." }, { status: 400 });
  }

  const prompt = `You are a concise assistant.
Return JSON with keys: analysis (exactly 3 sentences), actionPlan (array of exactly 3 steps), and category.
Choose category from this exact list only: ${ALLOWED_CATEGORIES.join(", ")}.
If unsure or mixed topic, set category to "Other".
Focus on turning the transcript into actionable guidance.
Transcript:
${text}`;

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: "You output strict JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: "OpenAI request failed.", details: message },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    let parsed: { analysis?: string; actionPlan?: string[]; category?: string } | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "OpenAI returned invalid JSON.", details: content },
        { status: 502 }
      );
    }

    if (!parsed?.analysis || !Array.isArray(parsed.actionPlan)) {
      return NextResponse.json(
        { error: "OpenAI returned an incomplete response.", details: content },
        { status: 502 }
      );
    }

    const normalizedCategory =
      parsed.category &&
      ALLOWED_CATEGORIES.find(
        (value) => value.toLowerCase() === parsed.category?.toLowerCase()
      );

    return NextResponse.json({
      analysis: parsed.analysis,
      actionPlan: parsed.actionPlan.slice(0, 3),
      category: normalizedCategory ?? "Other",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "OpenAI request failed.", details: String(error) },
      { status: 502 }
    );
  }
}

