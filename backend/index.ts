import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
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

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

// // Embedding function
// async function generateEmbedding(text: string): Promise<number[]> {
//   const response = await fetch("https://api.openai.com/v1/embeddings", {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       input: text.slice(0, 2000),
//       model: "text-embedding-ada-002",
//     }),
//   });

//   const json = (await response.json()) as {
//     data: { embedding: number[] }[];
//   };

//   return json.data[0].embedding;
// }

app.post("/ask", async (req, res) => {
  try {
    const { url, question } = req.body;
    if (!url || !question)
      return res.status(400).json({ error: "Missing URL or question" });

    // 🧠 Try cache first
    const { data: cached, error } = await supabase
      .from("cached_pages")
      .select("content")
      .eq("url", url)
      .single();

    let allText = cached?.content;

    if (!allText) {
      // 🕸 Scrape
      const mainRes = await fetch(url);
      const mainHtml = await mainRes.text();
      const $ = cheerio.load(mainHtml);

      const baseUrl = new URL(url).origin;
      const links: string[] = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const fullUrl = href.startsWith("/") ? baseUrl + href : href;
        if (!links.includes(fullUrl) && fullUrl !== url && links.length < 3) {
          links.push(fullUrl);
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

      allText = [mainHtml, ...linkedContents]
        .map(extractReadableText)
        .join("\n")
        .slice(0, 12000);

      // 💾 Save to Supabase
      const insertObj: any = {
        url,
        content: allText,
        created_at: new Date().toISOString(),
      };

      console.log(insertObj, 'insertObj')
      // try {
      //   const embedding = await generateEmbedding(allText);
      //   insertObj.embedding = embedding;
      // } catch (err) {
      //   console.warn("⚠️ Embedding generation failed:", err);
      // }

      // console.log(supabase)
      await supabase.from("cached_pages").insert(insertObj);
    }

    // 🧠 Ask LLM (Claude)
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
            content: `Analyze this website and answer:\n\n${allText}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    const data = (await claudeRes.json()) as {
      content?: { text: string }[];
    };

    const answer = data?.content?.[0]?.text || "No answer received";
    res.json({ answer });
  } catch (err) {
    console.error("❌ Error analyzing site:", err);
    res.status(500).json({ error: "Failed to analyze website" });
  }
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
