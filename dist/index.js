"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cheerio = __importStar(require("cheerio"));
const tools_1 = require("./tools");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = 5002;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static("frontend"));
// MCP-compatible tool discovery
app.get("/tools.json", (req, res) => {
    res.json(tools_1.tools);
});
// Main analyze logic used by both routes
async function analyzeWebsite(url, question) {
    const mainRes = await (0, node_fetch_1.default)(url);
    const mainHtml = await mainRes.text();
    const $ = cheerio.load(mainHtml);
    const baseUrl = new URL(url).origin;
    const links = [];
    $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href)
            return;
        if (href.startsWith("/") || href.startsWith(baseUrl)) {
            const fullUrl = href.startsWith("/") ? baseUrl + href : href;
            if (!links.includes(fullUrl) && fullUrl !== url && links.length < 3) {
                links.push(fullUrl);
            }
        }
    });
    const linkedContents = await Promise.all(links.map(async (link) => {
        try {
            const res = await (0, node_fetch_1.default)(link);
            return await res.text();
        }
        catch {
            return "";
        }
    }));
    function extractReadableText(html) {
        const $ = cheerio.load(html);
        $("script, style, noscript").remove();
        return $("body").text().replace(/\s+/g, " ").trim();
    }
    const allText = [mainHtml, ...linkedContents]
        .map(extractReadableText)
        .join("\n")
        .slice(0, 12000); // Claude's safe limit
    const claudeRes = await (0, node_fetch_1.default)("https://api.anthropic.com/v1/messages", {
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
    const data = await claudeRes.json();
    const answer = data?.content?.[0]?.text || data?.content || "No answer received.";
    return answer;
}
app.post("/ask", async (req, res) => {
    try {
        const { url, question } = req.body;
        if (!url || !question)
            return res.status(400).json({ error: "Missing URL or question" });
        // 1. Fetch main page
        const mainRes = await (0, node_fetch_1.default)(url);
        const mainHtml = await mainRes.text();
        const $ = cheerio.load(mainHtml);
        // 2. Extract up to 3 internal links
        const baseUrl = new URL(url).origin;
        const links = [];
        $("a[href]").each((_, el) => {
            const href = $(el).attr("href");
            if (!href)
                return;
            if (href.startsWith("/") || href.startsWith(baseUrl)) {
                const fullUrl = href.startsWith("/") ? baseUrl + href : href;
                if (!links.includes(fullUrl) && fullUrl !== url && links.length < 3) {
                    links.push(fullUrl);
                }
            }
        });
        // 3. Fetch content from internal links
        const linkedContents = await Promise.all(links.map(async (link) => {
            try {
                const res = await (0, node_fetch_1.default)(link);
                return await res.text();
            }
            catch {
                return "";
            }
        }));
        // 4. Combine all content
        function extractReadableText(html) {
            const $ = cheerio.load(html);
            $("script, style, noscript").remove(); // remove useless tags
            return $("body").text().replace(/\s+/g, " ").trim();
        }
        const allText = [mainHtml, ...linkedContents]
            .map(extractReadableText)
            .join("\n")
            .slice(0, 12000); // stay within Claude’s safe limits
        // 5. Ask Claude
        const claudeRes = await (0, node_fetch_1.default)("https://api.anthropic.com/v1/messages", {
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
        const data = await claudeRes.json();
        const answer = data?.content?.[0]?.text || data?.content || "No answer received.";
        console.log(answer);
        res.json({ answer });
    }
    catch (err) {
        console.error("❌ Error analyzing site:", err);
        res.status(500).json({ error: "Failed to analyze website" });
    }
});
// MCP-compatible tool invocation (optional)
app.post("/tools/analyze_website", async (req, res) => {
    try {
        const { url, question } = req.body;
        if (!url || !question)
            return res.status(400).json({ error: "Missing URL or question" });
        const answer = await analyzeWebsite(url, question);
        res.json({ answer });
    }
    catch (err) {
        console.error("❌ Error in MCP tool:", err);
        res.status(500).json({ error: "Failed to analyze website" });
    }
});
app.listen(port, () => {
    console.log(`🟢 Server running at http://localhost:${port}`);
});
