import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 ISPA-STAD MCP Server Aktif! Endpoint Claude berada di: /api/mcp");
});

// --- 1. SETUP SERVER MCP ---
const server = new Server(
  { name: "ISPA-STAD-Pinterest", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// --- 2. LOGIKA FAST LOG IN (WIB) ---
const getFastLoginSesi = () => {
  const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false };
  const hour = parseInt(new Intl.DateTimeFormat('id-ID', options).format(new Date()));
  
  if (hour >= 4 && hour < 11) return "Pagi";
  if (hour >= 11 && hour < 15) return "Siang";
  if (hour >= 15 && hour < 19) return "Sore";
  if (hour >= 19 || hour < 4) return "Malam";
  return "Waktu Tidak Diketahui";
};

// --- 3. DEFINISI TOOLS UNTUK CLAUDE ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_pinterest",
        description: "Mencari referensi gambar anatomi karakter (ingat: style Furry wajib 4 jari).",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Kata kunci gambar yang ingin dicari" }
          },
          required: ["query"]
        }
      }
    ]
  };
});

// --- 4. EKSEKUSI PINTEREST SCRAPER ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search_pinterest") {
    const query = request.params.arguments.query;
    const sesiWaktu = getFastLoginSesi();
    
    try {
      // Ambil cookie dari Vercel Environment Variables
      const cookie = process.env.PINTEREST_COOKIE || ""; 
      
      const res = await fetch(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, {
        headers: {
          "Cookie": cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      
      const html = await res.text();
      const matches = html.match(/https:\/\/i\.pinimg\.com\/236x\/[a-zA-Z0-9/_.-]+/g) || [];
      const highRes = [...new Set(matches.map(img => img.replace("/236x/", "/736x/")))].slice(0, 10);

      // Logika Database sementara diarahkan ke Vercel Logs (Console)
      console.log(`[LOG] Sesi: ${sesiWaktu} | Query: ${query} | Hasil: ${highRes.length}`);

      return {
        content: [{ 
          type: "text", 
          text: `[Sesi: ${sesiWaktu}]\nDitemukan ${highRes.length} gambar untuk "${query}":\n\n${highRes.join('\n')}` 
        }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    }
  }
  throw new Error("Tool tidak ditemukan");
});

// --- 5. ENDPOINT TRANSPORT VERCEL (SSE) ---
let transport;

// Endpoint 1: Membuka jembatan koneksi (GET)
app.get("/api/mcp", async (req, res) => {
  transport = new SSEServerTransport("/api/mcp/message", res);
  await server.connect(transport);
});

// Endpoint 2: Menerima pesan dari Claude (POST)
app.post("/api/mcp/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(500).send("Transport belum diinisialisasi. Panggil GET /api/mcp dulu.");
  }
});

export default app;
