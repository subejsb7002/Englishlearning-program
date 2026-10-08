require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.Englishlearningapikey,
});

const SYSTEM_PROMPT = `你是一个专业的英语语法检查助手。请分析用户输入的英文文本，找出所有错误。

错误必须分为以下三类之一：
- grammar：语法错误
- spelling：拼写错误
- usage：用法不当

请只返回一个合法的 json 对象。

JSON 结构：
{
  "errors": [
    {
      "type": "grammar 或 spelling 或 usage",
      "original_text": "文本中出错的原片段",
      "suggestion": "修改建议",
      "explanation": "用中文简要解释"
    }
  ]
}

严格要求：
1. original_text 必须与原文完全一致，逐字复制。
2. errors 按从左到右顺序排列。
3. 没错误则返回空数组。`;

const OPTIMIZE_PROMPT = `你是一位英语写作专家。请把用户输入的英文文本改写得更高级、更地道，同时保持原意。

只返回一个合法的 json 对象，结构：
{
  "optimized": "优化后的完整文本",
  "changes": [
    {
      "original": "原文片段（必须逐字来自原文）",
      "optimized": "优化后的片段",
      "reason": "中文说明为什么这样改"
    }
  ]
}

严格要求：
- changes 中的 original 必须逐字复制原文，能精确搜索到。
- 找不到精确对应片段时，宁可返回空数组，不要编造。
- 原文无需改动则 changes 返回空数组。`;

function splitIntoChunks(text, maxLen = 1800) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n'];
      for (const bp of breakPoints) {
        const idx = text.lastIndexOf(bp, end);
        if (idx > start + maxLen * 0.5) {
          end = idx + bp.length;
          break;
        }
      }
    }
    chunks.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return chunks;
}

function findMatch(text, fragment, searchStart) {
  let idx = text.indexOf(fragment, searchStart);
  if (idx !== -1) return idx;
  idx = text.toLowerCase().indexOf(fragment.toLowerCase(), searchStart);
  if (idx !== -1) return idx;
  return text.indexOf(fragment);
}

async function checkChunk(chunkText) {
  const completion = await openai.chat.completions.create({
    model: 'deepseek-flash',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: chunkText },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
  });
  const parsed = JSON.parse(completion.choices[0].message.content);
  return Array.isArray(parsed.errors) ? parsed.errors : [];
}

app.post('/api/check-grammar', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: '请输入文本' });

    const chunks = splitIntoChunks(text);
    const allErrors = [];
    for (const chunk of chunks) {
      let chunkErrors = [];
      try {
        chunkErrors = await checkChunk(chunk.text);
      } catch (e) {
        console.error('分块调用失败：', e.message);
        continue;
      }
      let searchStart = 0;
      for (const err of chunkErrors) {
        if (!err.original_text || !err.type) continue;
        const idx = findMatch(chunk.text, err.original_text, searchStart);
        if (idx === -1) continue;
        allErrors.push({
          type: err.type,
          original_text: err.original_text,
          suggestion: err.suggestion || '',
          explanation: err.explanation || '',
          start: chunk.offset + idx,
          end: chunk.offset + idx + err.original_text.length,
        });
        searchStart = idx + err.original_text.length;
      }
    }
    allErrors.sort((a, b) => a.start - b.start);
    const filtered = [];
    let lastEnd = 0;
    for (const err of allErrors) {
      if (err.start >= lastEnd) {
        filtered.push(err);
        lastEnd = err.end;
      }
    }
    res.json({ errors: filtered, textLength: text.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '语法检查失败，请重试' });
  }
});

app.post('/api/optimize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: '请输入文本' });

    const MAX_LEN = 6000;
    const inputText = text.length > MAX_LEN ? text.slice(0, MAX_LEN) : text;
    const wasTruncated = text.length > MAX_LEN;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: OPTIMIZE_PROMPT },
        { role: 'user', content: inputText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
    const validChanges = rawChanges.filter((c) => {
      if (!c.original || !c.optimized) return false;
      if (!inputText.includes(c.original)) return false;
      return true;
    });

    res.json({
      optimized: parsed.optimized || '',
      changes: validChanges,
      truncated: wasTruncated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '优化失败，请重试' });
  }
});

// ⭐⭐⭐ 关键：这两行决定服务器是否监听端口 ⭐⭐⭐
app.listen(3000, () => {
  console.log('✅ 服务器已启动！请打开浏览器访问 http://localhost:3000');
});
