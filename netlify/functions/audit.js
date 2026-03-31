exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { url } = body;
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing URL" }) };

  // STEP 1: Fetch the actual page content
  let pageContent = "";
  try {
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LobbyTest/1.0)"
      },
      signal: AbortSignal.timeout(8000)
    });
    const html = await pageRes.text();

    // Strip HTML tags and collapse whitespace to get readable text
    pageContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000); // Keep within token limits
  } catch(err) {
    return { statusCode: 422, headers, body: JSON.stringify({ error: "Could not fetch website: " + err.message }) };
  }

  if (!pageContent || pageContent.length < 100) {
    return { statusCode: 422, headers, body: JSON.stringify({ error: "Could not extract content from website" }) };
  }

  // STEP 2: Pass real content to Claude
  const prompt = `You are a brutally honest brand and website expert. Analyse this website based ONLY on the actual content below. Do not invent or assume anything not present in the content.

Website URL: ${url}

WEBSITE CONTENT:
${pageContent}

Score these 5 categories out of 20 each. Be specific to the actual content above:

1. POSITIONING (0-20): Crystal clear in 5 seconds what they do, who for, what makes them different?
2. FIRST IMPRESSION (0-20): Does the visual design signal credibility immediately?
3. TRUST SIGNALS (0-20): Client names, logos, testimonials, results visible? No social proof = under 8.
4. CONVERSION (0-20): Single clear CTA? Easy to take next step?
5. MESSAGING (0-20): Written for the reader or about the business?

Return ONLY valid JSON, no markdown:
{"overall_score":0,"verdict":"4-6 word phrase","summary":"2 sentences","categories":[{"name":"Positioning","score":0,"finding":"2 sentences specific to this site","level":"red"},{"name":"First impression","score":0,"finding":"2 sentences","level":"amber"},{"name":"Trust signals","score":0,"finding":"2 sentences","level":"amber"},{"name":"Conversion","score":0,"finding":"2 sentences","level":"amber"},{"name":"Messaging","score":0,"finding":"2 sentences","level":"green"}]}

Level: green>=15, amber 9-14, red<=8`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (!data.content || !data.content.length) throw new Error("Empty response from API");

    const text = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("No JSON found");

    return { statusCode: 200, headers, body: text.slice(i, j + 1) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
