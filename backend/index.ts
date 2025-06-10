import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import { tools } from "./tools";

dotenv.config();

const app = express();
const port = 5002;

app.use(cors());
app.use(express.json());
app.use(express.static("frontend"));

// MCP-compatible tool discovery
app.get("/tools.json", (req, res) => {
  res.json(tools);
});

// Main analyze logic used by both routes
async function analyzeWebsite(url: string, question: string): Promise<string> {
  const mainRes = await fetch(url);
  const mainHtml = await mainRes.text();
  const $ = cheerio.load(mainHtml);

  const baseUrl = new URL(url).origin;
  const links: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("/") || href.startsWith(baseUrl)) {
      const fullUrl = href.startsWith("/") ? baseUrl + href : href;
      if (!links.includes(fullUrl) && fullUrl !== url && links.length < 3) {
        links.push(fullUrl);
      }
    }
  });

  const linkedContents = await Promise.all(
    links.map(async (link) => {
      try {
        const res = await fetch(link);
        return await res.text();
      } catch {
        return "";
      }
    })
  );

  function extractReadableText(html: string): string {
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  }

  const allText = [mainHtml, ...linkedContents]
    .map(extractReadableText)
    .join("\n")
    .slice(0, 12000); // Claude's safe limit

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-opus-20240229",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Please analyze the following website content and answer this question:\n\n${allText}\n\nQuestion: ${question}`
        },
      ],
    }),
  });

  const data: any = await claudeRes.json();
  const answer = data?.content?.[0]?.text || data?.content || "No answer received.";
  return answer;
}

app.post("/ask", async (req, res) => {
  try {
    const { url, question } = req.body;
    if (!url || !question)
      return res.status(400).json({ error: "Missing URL or question" });

    // 1. Fetch main page
    const mainRes = await fetch(url);
    const mainHtml = await mainRes.text();
    const $ = cheerio.load(mainHtml);

    // 2. Extract up to 3 internal links
    const baseUrl = new URL(url).origin;
    const links: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (href.startsWith("/") || href.startsWith(baseUrl)) {
        const fullUrl = href.startsWith("/") ? baseUrl + href : href;
        if (!links.includes(fullUrl) && fullUrl !== url && links.length < 3) {
          links.push(fullUrl);
        }
      }
    });

    // 3. Fetch content from internal links
    const linkedContents = await Promise.all(
      links.map(async (link) => {
        try {
          const res = await fetch(link);
          return await res.text();
        } catch {
          return "";
        }
      })
    );

    // 4. Combine all content
    function extractReadableText(html: string): string {
      const $ = cheerio.load(html);
      $("script, style, noscript").remove(); // remove useless tags
      return $("body").text().replace(/\s+/g, " ").trim();
    }

    const allText = [mainHtml, ...linkedContents]
      .map(extractReadableText)
      .join("\n")
      .slice(0, 12000); // stay within Claude’s safe limits

    // 5. Ask Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Please analyze the following website content and answer this question:\n\n${allText}\n\nQuestion: ${question}`
          },
        ],
      }),
    });

    const data: any = await claudeRes.json();
    const answer =
      data?.content?.[0]?.text || data?.content || "No answer received.";
    console.log(answer);

    res.json({ answer });
  } catch (err) {
    console.error("❌ Error analyzing site:", err);
    res.status(500).json({ error: "Failed to analyze website" });
  }
});


// MCP-compatible tool invocation (optional)
app.post("/tools/analyze_website", async (req, res) => {
  try {
    const { url, question } = req.body;
    if (!url || !question) return res.status(400).json({ error: "Missing URL or question" });
    const answer = await analyzeWebsite(url, question);
    res.json({ answer });
  } catch (err) {
    console.error("❌ Error in MCP tool:", err);
    res.status(500).json({ error: "Failed to analyze website" });
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
