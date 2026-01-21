import { NextResponse } from "next/server";
import bplistCreator from "bplist-creator";
import { parseBuffer } from "bplist-parser";

const defaultPlaceholder = "PASTE YOUR TOKEN HERE";

const replaceTokens = (value: unknown, token: string, placeholders: string[]): unknown => {
  if (typeof value === "string") {
    let updated = value;
    placeholders.forEach((placeholder) => {
      updated = updated.split(placeholder).join(token);
    });
    return updated;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceTokens(item, token, placeholders));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        replaceTokens(nested, token, placeholders),
      ])
    );
  }
  return value;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const templateUrl =
    process.env.SHORTCUT_TEMPLATE_URL ?? process.env.NEXT_PUBLIC_SHORTCUT_URL ?? "";
  const shortcutIdMatch = templateUrl.match(/shortcuts\/([0-9a-f]{32})/i);
  const shortcutId = shortcutIdMatch?.[1];
  if (!shortcutId) {
    return NextResponse.json({ error: "Shortcut template URL is not configured." }, { status: 500 });
  }

  try {
    const recordResponse = await fetch(`https://www.icloud.com/shortcuts/api/records/${shortcutId}`);
    if (!recordResponse.ok) {
      return NextResponse.json({ error: "Failed to load shortcut template." }, { status: 502 });
    }
    const record = (await recordResponse.json()) as {
      fields?: { shortcut?: { value?: { downloadURL?: string } } };
    };
    const downloadUrl = record.fields?.shortcut?.value?.downloadURL;
    if (!downloadUrl) {
      return NextResponse.json({ error: "Shortcut download URL not found." }, { status: 502 });
    }

    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      return NextResponse.json({ error: "Unable to download shortcut file." }, { status: 502 });
    }
    const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    const [parsedShortcut] = parseBuffer(fileBuffer) as unknown[];

    const placeholderRaw = process.env.SHORTCUT_TOKEN_PLACEHOLDER ?? defaultPlaceholder;
    const placeholders = [placeholderRaw, `(${placeholderRaw})`];
    const updatedShortcut = replaceTokens(parsedShortcut, token, placeholders);
    const outputBuffer = Buffer.from(bplistCreator(updatedShortcut as Record<string, unknown>));

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=ValueMiner.shortcut",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shortcut generation failed." },
      { status: 500 }
    );
  }
}

