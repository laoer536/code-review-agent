import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function chat(
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
) {
  const completion = await openai.chat.completions.create({
    messages,
    model: "deepseek-v4-pro",
    tools,
    stream: false,
  });

  return completion.choices[0]!.message;
}
