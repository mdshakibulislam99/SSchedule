import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// The packaged Android/iOS app runs from https://localhost and has no origin
// relationship with this server, so the AI endpoints must opt in to CORS.
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Initialize GoogleGenAI on the server
function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const key = customApiKey || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// App Version & Force-Update Configuration
interface AppVersionConfigPayload {
  latestVersion: string;
  minRequiredVersion: string;
  forceUpdate: boolean;
  gracePeriodDays: number;
  downloadUrl: string;
  title: string;
  message: string;
  releaseNotes: string[];
  updatedAt: string;
}

let appVersionConfig: AppVersionConfigPayload = {
  latestVersion: process.env.LATEST_APP_VERSION || '1.0.0',
  minRequiredVersion: process.env.MIN_REQUIRED_APP_VERSION || '1.0.0',
  forceUpdate: process.env.FORCE_APP_UPDATE === 'true',
  gracePeriodDays: Number(process.env.APP_UPDATE_GRACE_DAYS) || 7,
  downloadUrl: process.env.APP_DOWNLOAD_URL || 'https://play.google.com/store/apps/details?id=com.chronopulse.ai',
  title: 'Update Required',
  message: 'A critical update is required to continue using ChronoPulse AI. Please update your app to access your study schedule and AI features.',
  releaseNotes: [
    'Smart Schedule & Task Optimizer improvements',
    'Enhanced multi-model AI responses & study tutor',
    'Critical stability and offline sync fixes',
  ],
  updatedAt: new Date().toISOString(),
};

// Public endpoint for mobile clients to query version requirements
app.get('/api/app-version', (_req: Request, res: Response) => {
  res.json(appVersionConfig);
});

// Management endpoint to update version policy on the fly
app.post('/api/app-version', (req: Request, res: Response) => {
  try {
    const {
      latestVersion,
      minRequiredVersion,
      forceUpdate,
      gracePeriodDays,
      downloadUrl,
      title,
      message,
      releaseNotes,
    } = req.body;

    if (latestVersion) appVersionConfig.latestVersion = String(latestVersion);
    if (minRequiredVersion) appVersionConfig.minRequiredVersion = String(minRequiredVersion);
    if (typeof forceUpdate === 'boolean') appVersionConfig.forceUpdate = forceUpdate;
    if (typeof gracePeriodDays === 'number' && gracePeriodDays >= 0) {
      appVersionConfig.gracePeriodDays = gracePeriodDays;
    }
    if (downloadUrl) appVersionConfig.downloadUrl = String(downloadUrl);
    if (title) appVersionConfig.title = String(title);
    if (message) appVersionConfig.message = String(message);
    if (Array.isArray(releaseNotes)) appVersionConfig.releaseNotes = releaseNotes.map(String);
    appVersionConfig.updatedAt = new Date().toISOString();

    return res.json({
      success: true,
      config: appVersionConfig,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to update version configuration' });
  }
});

// Gemini AI generation endpoint with Google Search Grounding support
app.post('/api/ai/gemini', async (req: Request, res: Response) => {
  try {
    const { prompt, systemInstruction, enableSearch } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const customKey = req.headers['x-gemini-key'] as string | undefined;
    if (!customKey && !process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'Gemini API key is missing. Add a key in AI Provider settings or configure GEMINI_API_KEY.' });
    }
    const ai = getGeminiClient(customKey);

    // If search grounding is requested, use gemini-3.5-flash with googleSearch tool
    const modelToUse = enableSearch ? 'gemini-3.5-flash' : 'gemini-3.8-flash';
    const config: any = {};

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    if (enableSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    let response;
    try {
      response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
    } catch (modelErr: any) {
      if (enableSearch) {
        console.warn('Fallback from gemini-3.5-flash for search grounding:', modelErr?.message);
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined,
          });
        } catch (_innerErr) {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: systemInstruction ? { systemInstruction } : undefined,
          });
        }
      } else {
        throw modelErr;
      }
    }

    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const sources =
      groundingMetadata?.groundingChunks
        ?.map((chunk: any) => ({
          title: chunk.web?.title || 'Web Citation',
          uri: chunk.web?.uri || '',
        }))
        .filter((s: any) => Boolean(s.uri)) || [];

    const searchQueries = groundingMetadata?.webSearchQueries || [];

    return res.json({
      text: response.text || '',
      sources,
      searchQueries,
      grounded: Boolean(sources.length > 0 || searchQueries.length > 0),
    });
  } catch (error: any) {
    console.error('Gemini API error:', error);
    const message = error?.message || 'Failed to generate response with Gemini';
    const status = Number(error?.status || error?.statusCode) === 429 ||
      /quota|rate.?limit|resource_exhausted|too many requests/i.test(message)
      ? 429
      : 500;
    return res.status(status).json({ error: message });
  }
});

// Proxy endpoint for external AI providers (OpenAI, Claude, DeepSeek)
app.post('/api/ai/proxy', async (req: Request, res: Response) => {
  try {
    const { provider, prompt, systemInstruction } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'API key is required in Authorization header' });
    }

    const apiKey = authHeader.replace(/^Bearer\s+/i, '');

    if (provider === 'openai') {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        return res.status(openAiRes.status).json({ error: `OpenAI error: ${errText}` });
      }

      const data = await openAiRes.json();
      const text = data.choices?.[0]?.message?.content || '';
      return res.json({ text });
    }

    if (provider === 'deepseek') {
      const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!dsRes.ok) {
        const errText = await dsRes.text();
        return res.status(dsRes.status).json({ error: `DeepSeek error: ${errText}` });
      }

      const data = await dsRes.json();
      const text = data.choices?.[0]?.message?.content || '';
      return res.json({ text });
    }

    if (provider === 'claude') {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: systemInstruction || undefined,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return res.status(claudeRes.status).json({ error: `Claude error: ${errText}` });
      }

      const data = await claudeRes.json();
      const text = data.content?.[0]?.text || '';
      return res.json({ text });
    }

    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  } catch (error: any) {
    console.error('AI Proxy error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to process AI proxy request',
    });
  }
});

// Setup Vite middleware or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
