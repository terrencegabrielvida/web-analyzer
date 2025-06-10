export const tools = [
  {
    name: "analyze_website",
    description: "Fetches and analyzes the readable content of a website based on a user's question.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the website to analyze."
        },
        question: {
          type: "string",
          description: "A question to ask about the website content."
        }
      },
      required: ["url", "question"]
    }
  }
];
