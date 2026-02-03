import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUTPUT_FILE = join(DATA_DIR, "papers.json");

// ---------------------------------------------------------------------------
// Prompt — hardcoded to 14-day timeframe, deployed weekly
// ---------------------------------------------------------------------------
const SCHOLAR_URL =
  "https://scholar.google.com/scholar?hl=iw&as_sdt=0%2C5&inst=1200643855431153338&q=lior+klein&oq=";

const SYSTEM_PROMPT = `You are an expert academic research assistant. Your task is to find the top 10 most recent publications relevant to a researcher's Google Scholar profile.

You MUST output your final answer in a specific JSON format (described below). Before the JSON, you may include a brief plain-text summary of trends and insights.

## Instructions

1. **Fetch the researcher's Google Scholar page** at this URL:
   ${SCHOLAR_URL}
   Extract publication titles, research areas, key terms, and co-author names.

2. **Identify 5-10 key research topics** from the profile (e.g., sensors, magnetoresistance, noise, magnetic materials, signal processing, biomedical sensing).

3. **Search for recent publications** (last 14 days) using those topics. Target academic sources:
   - arxiv.org
   - ieee.org
   - sciencedirect.com
   - nature.com
   - sciencedaily.com
   - phys.org
   Include year filters (2025 OR 2026) in your queries.

4. **Rank results** by topic relevance, recency, source quality, and methodology overlap.

5. **Output format** — You MUST end your response with a JSON block wrapped in markers:

%%%JSON_START%%%
{
  "papers": [
    {
      "rank": 1,
      "title": "Paper Title",
      "authors": "Author1, Author2, ...",
      "source": "Journal or arXiv",
      "date": "YYYY-MM-DD",
      "url": "https://...",
      "description": "2-3 sentence relevance explanation"
    }
  ],
  "summary": {
    "trends": "Brief paragraph about common themes and emerging trends",
    "recommendations": "Which papers are most worth reading and why"
  }
}
%%%JSON_END%%%

Important rules:
- Return exactly 10 papers (or fewer if you truly cannot find 10 relevant ones from the last 14 days).
- Every paper MUST have a working URL.
- Prefer arXiv, IEEE, Nature, and Science Direct links.
- Dates should be as precise as possible (YYYY-MM-DD preferred, YYYY-MM acceptable).
- The description should explain relevance to the researcher's work specifically.
`;

// ---------------------------------------------------------------------------
// Call Anthropic API
// ---------------------------------------------------------------------------
async function callAnthropic() {
  const client = new Anthropic();

  console.log("Calling Anthropic API (claude-opus-4-5-20251101 + web_search)...");
  const response = await client.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
    messages: [
      {
        role: "user",
        content:
          "Find the top 10 publications from the last 14 days that are most relevant to the researcher's Google Scholar profile. Search thoroughly across multiple academic sources and return the results in the specified JSON format.",
      },
    ],
  });

  // Collect all text blocks from the response
  const textParts = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  return textParts.join("\n");
}

// ---------------------------------------------------------------------------
// Parse response into structured JSON
// ---------------------------------------------------------------------------
function parseResponse(rawText) {
  // Strategy 1: Look for %%%JSON_START%%% ... %%%JSON_END%%% markers
  const markerMatch = rawText.match(
    /%%%JSON_START%%%([\s\S]*?)%%%JSON_END%%%/
  );
  if (markerMatch) {
    try {
      return JSON.parse(markerMatch[1].trim());
    } catch {
      console.warn("Marker-delimited JSON found but failed to parse, trying fallback...");
    }
  }

  // Strategy 2: Look for ```json ... ``` code blocks
  const codeBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      console.warn("Code-block JSON found but failed to parse, trying fallback...");
    }
  }

  // Strategy 3: Find the largest {...} block that parses as JSON
  const braceMatches = rawText.match(/\{[\s\S]*\}/g);
  if (braceMatches) {
    // Sort by length descending and try each
    const sorted = braceMatches.sort((a, b) => b.length - a.length);
    for (const candidate of sorted) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.papers && Array.isArray(parsed.papers)) {
          return parsed;
        }
      } catch {
        // continue
      }
    }
  }

  throw new Error("Could not extract valid JSON from API response");
}

// ---------------------------------------------------------------------------
// Derive download URLs (e.g. arXiv abs → pdf)
// ---------------------------------------------------------------------------
function deriveDownloadUrl(url) {
  if (!url) return null;
  // arXiv: /abs/XXXX.XXXXX → /pdf/XXXX.XXXXX.pdf
  const arxivMatch = url.match(/arxiv\.org\/abs\/([\d.]+)/);
  if (arxivMatch) {
    return `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
  }
  return null;
}

function enrichPapers(data) {
  if (!data.papers) return data;
  data.papers = data.papers.map((paper) => ({
    ...paper,
    downloadUrl: deriveDownloadUrl(paper.url),
  }));
  return data;
}

// ---------------------------------------------------------------------------
// Extract plain-text summary that precedes the JSON block
// ---------------------------------------------------------------------------
function extractPreSummary(rawText) {
  const markerIdx = rawText.indexOf("%%%JSON_START%%%");
  if (markerIdx > 0) {
    return rawText.substring(0, markerIdx).trim();
  }
  const codeIdx = rawText.indexOf("```json");
  if (codeIdx > 0) {
    return rawText.substring(0, codeIdx).trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load previous data for fallback on failure
  let previousData = null;
  if (existsSync(OUTPUT_FILE)) {
    try {
      previousData = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    } catch {
      // ignore
    }
  }

  try {
    const rawText = await callAnthropic();
    console.log("API response received, parsing...");

    const preSummary = extractPreSummary(rawText);
    const data = parseResponse(rawText);
    const enriched = enrichPapers(data);

    const output = {
      generatedAt: new Date().toISOString(),
      timeframe: "14 days",
      scholarUrl: SCHOLAR_URL,
      preSummary: preSummary || undefined,
      ...enriched,
    };

    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Wrote ${output.papers.length} papers to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error("Generation failed:", err.message);

    // Preserve previous data with error annotation
    if (previousData) {
      previousData.error = `Update failed at ${new Date().toISOString()}: ${err.message}`;
      writeFileSync(OUTPUT_FILE, JSON.stringify(previousData, null, 2), "utf-8");
      console.log("Preserved previous data with error annotation.");
    } else {
      // Write minimal error file so the site can show something
      const errorData = {
        generatedAt: new Date().toISOString(),
        error: err.message,
        papers: [],
        summary: null,
      };
      writeFileSync(OUTPUT_FILE, JSON.stringify(errorData, null, 2), "utf-8");
    }

    process.exit(1);
  }
}

main();
