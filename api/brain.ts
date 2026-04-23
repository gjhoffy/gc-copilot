// Vercel Edge Function: /api/brain
import { z } from "zod";

export const config = {
  runtime: 'edge',
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { prompt } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "API Key Missing in Vercel Settings" }), { status: 500, headers: corsHeaders });
    }

    // A bare-bones fetch to Gemini 2.0 Flash
    const response = await fetch(`${GEMINI_BASE}/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}