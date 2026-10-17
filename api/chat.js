
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed."
    });
  }

  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "Replicate API token is missing. Add REPLICATE_API_TOKEN in Vercel Environment Variables."
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const input = {
      prompt: [
        "You are a very helpful AI coding assistant inside AI Code Studio.",
        "Help users write, explain, debug, and improve HTML, CSS, and JavaScript.",
        "When asked for code, provide complete, runnable code when practical.",
        "",
        ...history.slice(-10).map((item) =>
          `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`
        ),
        `User: ${message}`,
        "Assistant:"
      ].join("\n")
    };

    const response = await fetch(
      "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait"
        },
        body: JSON.stringify({ input })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.title || "Replicate request failed."
      });
    }

    let output = data.output;

    if (Array.isArray(output)) {
      output = output.join("");
    }

    if (typeof output !== "string" || !output.trim()) {
      return res.status(502).json({
        error: `The model did not return text. Prediction status: ${data.status || "unknown"}.`
      });
    }

    return res.status(200).json({ reply: output });
  } catch (error) {
    console.error("AI Code Studio error:", error);

    return res.status(500).json({
      error: "Could not contact the AI service. Please try again."
    });
  }
}
