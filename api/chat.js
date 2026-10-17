
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Only POST requests are allowed."
    });
  }

  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error:
        "Replicate API token is missing. Add REPLICATE_API_TOKEN in Vercel Environment Variables."
    });
  }

  try {
    const {
      message,
      history = [],
      projectName = "Untitled Project",
      currentFile = "index.html",
      mode = "code",
      files = {}
    } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            item =>
              item &&
              typeof item.content === "string" &&
              ["user", "assistant"].includes(item.role)
          )
          .slice(-10)
      : [];

    const safeFiles =
      files &&
      typeof files === "object" &&
      !Array.isArray(files)
        ? files
        : {};

    const fileContext = Object.entries(safeFiles)
      .filter(
        ([path, content]) =>
          typeof path === "string" &&
          typeof content === "string" &&
          !path.startsWith("/") &&
          !path.split("/").includes("..")
      )
      .slice(0, 20)
      .map(
        ([path, content]) =>
          `FILE: ${path}\n${content.slice(0, 12000)}`
      )
      .join("\n\n--------------------\n\n");

    const systemInstructions = `
You are CodeStudio AI, an expert coding assistant inside a browser-based coding workspace.

Your job is to help users create, explain, debug, and improve HTML, CSS, JavaScript, and other project files.

PROJECT INFORMATION
Project name: ${String(projectName).slice(0, 200)}
Currently selected file: ${String(currentFile).slice(0, 300)}
Mode: ${String(mode).slice(0, 100)}

CURRENT PROJECT FILES
${fileContext || "(No project file contents were supplied.)"}

IMPORTANT RESPONSE FORMAT
Return exactly one valid JSON object, with no Markdown code fences and no text outside the JSON.

Use this structure:
{
  "message": "A helpful Markdown explanation for the user.",
  "edits": [
    {
      "path": "style.css",
      "find": "an exact, unique existing piece of text",
      "replace": "the replacement text"
    }
  ]
}

RULES FOR EDITS
1. When the user asks to modify existing project files, make targeted edits using "find" and "replace".
2. The "find" value must match the existing file text exactly, including punctuation and whitespace.
3. Make each "find" snippet specific enough to identify exactly one occurrence.
4. Use as few edits as practical. Do not replace entire files when a small change will work.
5. The "path" must be an existing project file for find-and-replace edits.
6. To create a new file, use:
   {
     "path": "new-file.js",
     "action": "create",
     "content": "complete file contents"
   }
7. Never invent existing code. Base all edits on the supplied file contents.
8. If you cannot safely determine the exact edit, explain what is missing in "message" and return "edits": [].
9. For questions asking only for an explanation, return "edits": [].
10. Do not claim that changes were applied. The application handles applying edits.
11. Keep user interface designs intact unless the user explicitly asks to change them.
12. For multiple-file changes, include the necessary edits for each affected file.
13. Keep the JSON valid. Escape newlines and quotation marks inside JSON strings.
14. Never include an edit that changes unrelated features.
15. If the user asks to build a new project from scratch, explain the appropriate approach in "message". Do not attempt to replace all files through a giant patch.
16. Return only the JSON object.
`;

    const prompt = [
      systemInstructions,
      ...safeHistory.map(item =>
        `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content.slice(0, 6000)}`
      ),
      `User: ${message}`,
      "Assistant: Return the required JSON object only."
    ].join("\n\n");

    const response = await fetch(
      "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait"
        },
        body: JSON.stringify({
          input: {
            prompt
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Replicate API error:", data);

      return res.status(response.status).json({
        error:
          data.detail ||
          data.title ||
          data.error ||
          "Replicate request failed."
      });
    }

    let output = data.output;

    if (Array.isArray(output)) {
      output = output.join("");
    }

    if (typeof output !== "string" || !output.trim()) {
      return res.status(502).json({
        error:
          `The model did not return text. Prediction status: ${data.status || "unknown"}.`
      });
    }

    return res.status(200).json({
      reply: output
    });
  } catch (error) {
    console.error("AI Code Studio error:", error);

    return res.status(500).json({
      error:
        "Could not contact the AI service. Please try again."
    });
  }
}
