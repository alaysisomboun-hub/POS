import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { verifyFirebaseToken, type AuthenticatedRequest } from './server/middleware/authMiddleware.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'grocery-pos-server',
    timezone: 'Asia/Vientiane',
    currency: 'LAK',
    timestamp: new Date().toISOString(),
  });
});

// Verify Firebase ID token on server-side
app.post('/api/auth/verify', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
  res.json({
    verified: true,
    user: req.authUser,
  });
});

// Server-side Gemini AI Business Analyst endpoint
app.post('/api/ai/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({
      error:
        'ບໍ່ພົບ GEMINI_API_KEY ໃນເຊີບເວີ ກະລຸນາກວດສອບການຕັ້ງຄ່າຄີໃນ Settings > Secrets ກ່ອນໃຊ້ງານ AI ວິເຄາະທຸລະກິດ',
    });
    return;
  }

  const { metrics, question } = (req.body ?? {}) as {
    metrics?: Record<string, unknown>;
    question?: string;
  };

  if (!metrics || typeof metrics !== 'object') {
    res.status(400).json({ error: 'ກະລຸນາສົ່ງຂໍ້ມູນສະຫຼຸບທຸລະກິດ (metrics) ເພື່ອທຳການວິເຄາະ' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const userQuestion =
      typeof question === 'string' && question.trim().length > 0
        ? question.trim()
        : 'ວິເຄາະພາບລວມທຸລະກິດຮ້ານຂາຍເຄື່ອງຍ່ອຍ-ຂາຍສົ່ງໃນຮອບ 30 ວັນທີ່ຜ່ານມາ ທັງຍອດຂາຍ ກຳໄລຂັ້ນຕົ້ນ ສິນຄ້າຂາຍດີ ສິນຄ້າສ່ຽງຂາດສະຕັອກ/ໝົດອາຍຸ ຄ່າໃຊ້ຈ່າຍ ລູກໜີ້/ເຈົ້າໜີ້ ພ້ອມຂໍ້ສະເໜີແນະທີ່ທຳໄດ້ທັນທີ';

    const promptText = [
      `ຄຳຖາມ/ໂຈດຈາກເຈົ້າຂອງຮ້ານ: ${userQuestion}`,
      '',
      'ຂໍ້ມູນທຸລະກິດຈິງຈາກລະບົບ POS (ສະກຸນເງິນກີບລາວ LAK):',
      JSON.stringify(metrics, null, 2),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptText,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'ທ່ານຄືຜູ້ຊ່ຽວຊານດ້ານການວິເຄາະທຸລະກິດຄ້າປີກ-ຄ້າສົ່ງ (Grocery POS Business Analyst) ທີ່ໃຫ້ຄຳປຶກສາເຈົ້າຂອງຮ້ານໃນປະເທດລາວ ໃຊ້ສະກຸນເງິນກີບ (LAK) ແບບຈຳນວນເຕັມສະເໝີ ' +
          'ຈົ່ງວິເຄາະໂດຍອ້າງອີງຈາກຕົວເລກຈິງໃນຂໍ້ມູນ JSON ທີ່ໄດ້ຮັບເທົ່ານັ້ນ ຫ້າມສ້າງຕົວເລກຂຶ້ນມາເອງ ' +
          'ຕອບເປັນພາສາລາວທີ່ກະຊັບ ຊັດເຈນ ປະຕິບັດຕາມໄດ້ຈິງ ແລະ ສອດຄ່ອງກັບໂຄງສ້າງ JSON ທີ່ກຳນົດ',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'ສະຫຼຸບພາບລວມສະຖານະທຸລະກິດ 2-4 ປະໂຫຍກພ້ອມຕົວເລກສຳຄັນຈິງເປັນພາສາລາວ',
            },
            directAnswer: {
              type: Type.STRING,
              description: 'ຄຳຕອບຕົງປະເດັນສຳລັບຄຳຖາມທີ່ເຈົ້າຂອງຮ້ານຖາມເປັນພາສາລາວ',
            },
            salesInsights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ຂໍ້ຄົ້ນພົບດ້ານຍອດຂາຍ ສິນຄ້າຂາຍດີ ແລະ ສິນຄ້າທີ່ເຄື່ອນໄຫວຊ້າ 2-4 ຂໍ້',
            },
            stockAndExpiryRisks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ຄວາມສ່ຽງດ້ານສະຕັອກໃກ້ໝົດ ສິນຄ້າໝົດ ແລະ ລັອດໃກ້ໝົດອາຍຸ/ໝົດອາຍຸ 2-4 ຂໍ້',
            },
            profitAndExpenseInsights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ການວິເຄາະກຳໄລຂັ້ນຕົ້ນ ຄ່າໃຊ້ຈ່າຍທຽບຍອດຂາຍ ລູກໜີ້ ແລະ ເຈົ້າໜີ້ 2-4 ຂໍ້',
            },
            actionRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ແຜນປະຕິບັດການເລັ່ງດ່ວນທີ່ເຈົ້າຂອງຮ້ານທຳໄດ້ທັນທີ 3-5 ຂໍ້',
            },
          },
          required: [
            'executiveSummary',
            'directAnswer',
            'salesInsights',
            'stockAndExpiryRisks',
            'profitAndExpenseInsights',
            'actionRecommendations',
          ],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      res.status(502).json({ error: 'Gemini AI ບໍ່ໄດ້ສົ່ງຂໍ້ມູນການວິເຄາະກັບມາ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ' });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      const rawObj = JSON.parse(rawText) as Record<string, unknown>;
      const cleanList = (v: unknown) =>
        Array.isArray(v)
          ? v.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [];
      parsed = {
        executiveSummary: typeof rawObj.executiveSummary === 'string' ? rawObj.executiveSummary : '',
        directAnswer: typeof rawObj.directAnswer === 'string' ? rawObj.directAnswer : '',
        salesInsights: cleanList(rawObj.salesInsights),
        stockAndExpiryRisks: cleanList(rawObj.stockAndExpiryRisks),
        profitAndExpenseInsights: cleanList(rawObj.profitAndExpenseInsights),
        actionRecommendations: cleanList(rawObj.actionRecommendations),
      };
    } catch {
      parsed = {
        executiveSummary: rawText,
        directAnswer: rawText,
        salesInsights: [],
        stockAndExpiryRisks: [],
        profitAndExpenseInsights: [],
        actionRecommendations: [],
      };
    }

    res.json({
      analysis: parsed,
      model: 'gemini-4-hydrogen',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ເກີດຂໍ້ຜິດພາດໃນການເອີ້ນ Gemini AI';
    const lower = message.toLowerCase();
    const statusCode =
      lower.includes('429') || lower.includes('resource_exhausted')
        ? 429
        : lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')
          ? 403
          : 500;
    res.status(statusCode).json({
      error: `ບໍ່ສາມາດວິເຄາະດ້ວຍ Gemini AI ໄດ້: ${message}`,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Grocery POS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
