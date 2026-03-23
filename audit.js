const { getStore } = require("@netlify/blobs");

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { url } = body;
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing URL" }) };

  // Normalise domain as cache key
  const domain = url.replace(/https?:\/\/(www\.)?/i, '').split('/')[0].toLowerCase().trim();

  // Check cache first
  try {
    const store = getStore("lobby-scores");
    const cached = await store.get(domain);
    if (cached) {
      console.log("Cache hit for " + domain);
      return { statusCode: 200, headers, body: cached };
    }
  } catch(e) {
    console.log("Cache read failed, continuing:", e.message);
  }

  // No cache - run the AI
  const prompt = "You are a brutally honest brand and website expert. Use your knowledge to analyse this website: " + url + "\n\nScore these 5 categories out of 20 each. Be specific:\n\n1. POSITIONING (0-20): Crystal clear in 5 seconds what they do, who for, what makes them different?\n2. FIRST IMPRESSION (0-20): Does the visual design signal credibility immediately?\n3. TRUST SIGNALS (0-20): Client names, logos, testimonials, results visible? No social proof = under 8.\n4. CONVERSION (0-20): Single clear CTA? Easy to take next step?\n5. MESSAGING (0-20): Written for the reader or about the business?\n\nReturn ONLY valid JSON, no markdown:\n{\"overall_score\":0,\"verdict\":\"4-6 word phrase\",\"summary\":\"2 sentences\",\"categories\":[{\"name\":\"Positioning\",\"score\":0,\"finding\":\"2 sentences specific to this site\",\"level\":\"red\"},{\"name\":\"First impression\",\"score\":0,\"finding\":\"2 sentences\",\"level\":\"amber\"},{\"name\":\"Trust signals\",\"score\":0,\"finding\":\"2 sentences\",\"level\":\"amber\"},{\"name\":\"Conversion\",\"score\":0,\"finding\":\"2 sentences\",\"level\":\"amber\"},{\"name\":\"Messaging\",\"score\":0,\"finding\":\"2 sentences\",\"level\":\"green\"}]}\n\nLevel: green>=15, amber 9-14, red<=8";

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

    if (!data.content || !data.content.length) {
      throw new Error("Empty response from API");
    }

    const text = data.content
      .filter(function(b) { return b.type === "text"; })
      .map(function(b) { return b.text; })
      .join("");

    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("No JSON found");

    const resultJson = text.slice(i, j + 1);

    // Store in cache
    try {
      const store = getStore("lobby-scores");
      await store.set(domain, resultJson);
      console.log("Cached result for " + domain);
    } catch(e) {
      console.log("Cache write failed:", e.message);
    }

    return { statusCode: 200, headers, body: resultJson };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
