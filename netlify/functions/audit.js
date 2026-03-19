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

  const prompt = `You are a brutally honest brand and website expert. Use your knowledge to analyse this website: ${url}

Score these 5 categories out of 20 each. Be specific — reference what you know about this site or its industry:

1. POSITIONING (0-20): Crystal clear in 5 seconds what they do, who for, what makes them different? Deduct for vague language.
2. FIRST IMPRESSION (0-20): Does the visual design signal credibility immediately? Current or dated?
3. TRUST SIGNALS (0-20): Client names, logos, testimonials, results visible? No social proof = under 8.
4. CONVERSION (0-20): Single clear CTA? Easy to take next step? Deduct for confusion or buried contact info.
5. MESSAGING (0-20): Written for the reader or about the business? Outcomes or filler words like "passionate"?

Return ONLY this exact JSON structure, no markdown, no explanation:
{"overall_score":0,"verdict":"4-6 word phrase","summary":"2 sentences of honest assessment","categories":[{"name":"Positioning","score":0,"finding":"2 sentences specific to this site","level":"red"},{"name":"First impression","score":0,"finding":"2 sentences specific to this site","level":"amber"},{"name":"Trust signals","score":0,"finding":"2 sentences specific to this site","level":"amber"},{"name":"Conversion","score":0,"finding":"2 sentences specific to this site","level":"amber"},{"name":"Messaging","score":0,"finding":"2 sentences specific to this site","level":"green"}]}

Level rules: green if score>=15, amber if 9-14, red if <=8`;

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
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i >= 0 && j > i) {
      return { statusCode: 200, headers, body: text.slice(i, j + 1) };
    }
    throw new Error("No JSON found in response");

  } catch (err) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: err.message }) 
    };
  }
};
