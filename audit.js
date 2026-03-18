exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const { url } = JSON.parse(event.body || "{}");
  if (!url) return { statusCode: 400, body: "Missing URL" };

  const prompt = `You are a brutally honest brand and website expert. Visit and thoroughly analyse this website: ${url}.

IMPORTANT: You must visit the actual URL, read the real homepage content, and give scores based on what you ACTUALLY see. Every score must reflect the specific site. Do NOT give generic feedback. Reference specific text, design choices, or missing elements you actually observed.

Score these 5 categories out of 20 each:

1. POSITIONING (0-20): Is it crystal clear in 5 seconds what this business does, who for, and what makes it different? Deduct for vague language or generic claims.
2. FIRST IMPRESSION (0-20): Does the visual design immediately signal credibility? Is it current or dated? Does the hero stop you?
3. TRUST SIGNALS (0-20): Client names, logos, testimonials, case studies, results? A site with no social proof scores under 8.
4. CONVERSION (0-20): Single clear CTA? Is it compelling and easy to act on? Deduct for competing CTAs or buried contact info.
5. MESSAGING (0-20): Written for the reader or about the business? Specific outcomes or filler phrases like "passionate" and "dedicated"?

For each category write ONE finding of 2 sentences referencing something SPECIFIC from the actual site.

Also provide:
- overall_score: sum of all 5 scores
- verdict: 4-6 word phrase (e.g. "Strong visuals, weak differentiation")
- summary: 2 specific sentences about what you actually saw

Level: green if score>=15, amber if 9-14, red if <=8

Return ONLY valid JSON, no markdown:
{"overall_score":0,"verdict":"...","summary":"...","categories":[{"name":"Positioning","score":0,"finding":"...","level":"red"}]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 900,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i >= 0 && j > i) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: text.slice(i, j + 1)
      };
    }
    throw new Error("No JSON in response");

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
