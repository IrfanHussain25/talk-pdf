import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function POST(req) {
  try {
    const { question, pdfBase64, conversation_id } = await req.json();

    if (!question || !pdfBase64 || !conversation_id) {
      return new Response(JSON.stringify({
        error: "Missing 'question', 'pdfBase64', or 'conversation_id'"
      }), { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const contents = [
      {
        role: "user",
        parts: [
          { text: question },
          {
            inline_data: {
              mime_type: "application/pdf",
              data: pdfBase64,
            },
          },
        ],
      },
    ];

    const result = await model.generateContent({ contents });
    const response = await result.response;
    const text = response.text();

    await supabase.from('chat_history').insert([
      {
        user_id: user.id,
        conversation_id,
        question,
        response: text,
        timestamp: new Date().toISOString(),
      },
    ]);

    return new Response(JSON.stringify({ answer: text }), {
      status: 200,
    });

  } catch (error) {
    console.error("Error in /api/chat:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
    });
  }
}
