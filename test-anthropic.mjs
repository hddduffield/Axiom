import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
config({ path: ".env.local" });

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 100,
  messages: [
    { role: "user", content: "Reply with exactly: SDK connection working." }
  ]
});

console.log(response.content[0].text);
