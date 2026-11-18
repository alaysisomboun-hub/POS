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
        'ไม่พบ GEMINI_API_KEY ในเซิร์ฟเวอร์ กรุณาตรวจสอบการตั้งค่าคีย์ใน Settings > Secrets ก่อนใช้งาน AI วิเคราะห์ธุรกิจ',
    });
    return;
  }

  const { metrics, question } = (req.body ?? {}) as {
    metrics?: Record<string, unknown>;
    question?: string;
  };

  if (!metrics || typeof metrics !== 'object') {
    res.status(400).json({ error: 'กรุณาส่งข้อมูลสรุปธุรกิจ (metrics) เพื่อทำการวิเคราะห์' });
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
        : 'วิเคราะห์ภาพรวมธุรกิจร้านขายของชำในรอบ 30 วันที่ผ่านมา ทั้งยอดขาย กำไรขั้นต้น สินค้าขายดี สินค้าเสี่ยงขาดสต็อก/หมดอายุ ค่าใช้จ่าย ลูกหนี้/เจ้าหนี้ พร้อมข้อเสนอแนะที่ทำได้ทันที';

    const promptText = [
      `คำถาม/โจทย์จากเจ้าของร้าน: ${userQuestion}`,
      '',
      'ข้อมูลธุรกิจจริงจากระบบ POS (สกุลเงินกีบลาว LAK):',
      JSON.stringify(metrics, null, 2),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptText,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์ธุรกิจค้าปลีกและร้านขายของชำ (Grocery POS Business Analyst) ที่ให้คำปรึกษาเจ้าของร้านในประเทศลาว/ไทย ใช้สกุลเงินกีบ (LAK) แบบจำนวนเต็มเสมอ ' +
          'จงวิเคราะห์โดยอ้างอิงจากตัวเลขจริงในข้อมูล JSON ที่ได้รับเท่านั้น ห้ามแต่งตัวเลขขึ้นมาเอง ' +
          'ตอบเป็นภาษาไทยที่กระชับ ชัดเจน ปฏิบัติตามได้จริง และสอดคล้องกับโครงสร้าง JSON ที่กำหนด',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'สรุปภาพรวมสถานะธุรกิจ 2-4 ประโยคพร้อมตัวเลขสำคัญจริง',
            },
            directAnswer: {
              type: Type.STRING,
              description: 'คำตอบตรงประเด็นสำหรับคำถามที่เจ้าของร้านถาม',
            },
            salesInsights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ข้อค้นพบด้านยอดขาย สินค้าขายดี และสินค้าที่เคลื่อนไหวช้า 2-4 ข้อ',
            },
            stockAndExpiryRisks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ความเสี่ยงด้านสต็อกใกล้หมด สินค้าหมด และล็อตใกล้หมดอายุ/หมดอายุ 2-4 ข้อ',
            },
            profitAndExpenseInsights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'การวิเคราะห์กำไรขั้นต้น ค่าใช้จ่ายเทียบยอดขาย ลูกหนี้ และเจ้าหนี้ 2-4 ข้อ',
            },
            actionRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'แผนปฏิบัติการเร่งด่วนที่เจ้าของร้านทำได้ทันที 3-5 ข้อ',
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
      res.status(502).json({ error: 'Gemini AI ไม่ได้ส่งข้อมูลการวิเคราะห์กลับมา กรุณาลองใหม่อีกครั้ง' });
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
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการเรียก Gemini AI';
    const lower = message.toLowerCase();
    const statusCode =
      lower.includes('429') || lower.includes('resource_exhausted')
        ? 429
        : lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')
          ? 403
          : 500;
    res.status(statusCode).json({
      error: `ไม่สามารถวิเคราะห์ด้วย Gemini AI ได้: ${message}`,
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
