// Client-side Gemini assistant for the installed Android build.
// In AI Studio's hosted environment the app calls the server route
// /api/assistant/chat; the installed WebView build has no server, so it
// talks to the Gemini API directly with the key baked in at build time
// (VITE_GEMINI_API_KEY, injected from a GitHub secret in CI).

export interface AssistantAttachment {
  name: string;
  mimeType: string;
  /** base64 payload for inline upload (small files) */
  data?: string;
  /** Gemini Files API uri for large uploads */
  fileUri?: string;
}

export interface AssistantChatRequest {
  message: string;
  imageDataUrl?: string;
  attachments?: AssistantAttachment[];
  history: Array<{role: string; text: string}>;
  lifeContext: Record<string, unknown>;
  apiKey: string;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Upload a large file through the Gemini Files API (resumable upload),
 * then wait until it becomes ACTIVE so it can be referenced as fileData.
 */
export async function uploadFileToGemini(
  file: File,
  apiKey: string,
): Promise<{uri: string; mimeType: string}> {
  const mimeType = file.type || 'application/octet-stream';
  const startRes = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({file: {display_name: file.name || 'attachment'}}),
  });
  if (!startRes.ok) throw new Error(`upload start failed (${startRes.status})`);
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('upload url missing');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': mimeType,
    },
    body: file,
  });
  if (!uploadRes.ok) throw new Error(`upload failed (${uploadRes.status})`);
  const info = (await uploadRes.json().catch(() => null)) as {
    file?: {uri?: string; name?: string; state?: string};
  } | null;
  const fileName = info?.file?.name;
  if (!fileName) throw new Error('upload response incomplete');

  // Wait for the file to leave PROCESSING state (usually seconds).
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stateRes = await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (stateRes.ok) {
      const state = ((await stateRes.json().catch(() => null)) as {
        state?: string;
        uri?: string;
      } | null) ?? {};
      if (state.state === 'ACTIVE' && state.uri) {
        return {uri: state.uri, mimeType};
      }
      if (state.state === 'FAILED') throw new Error('file processing failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('file processing timed out');
}

export interface AssistantChatResult {
  reply?: string;
  suggestedFollowUps?: string[];
  actions?: Array<Record<string, unknown>>;
  error?: string;
}

// Fastest first: fall through the chain when a model is unavailable or busy.
// 2.5 flash models get thinking switched off for near-instant first tokens.
const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
];

const MODEL_TIMEOUT_MS = 25_000;

const ASSISTANT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: {
      type: 'STRING',
      description: 'Natural Egyptian Arabic response grounded in the user life context.',
    },
    suggestedFollowUps: {
      type: 'ARRAY',
      items: {type: 'STRING'},
      description: '2 to 3 short Arabic follow-up prompts the user can tap next.',
    },
    actions: {
      type: 'ARRAY',
      description: 'Concrete actions to apply inside the app. Empty array if no mutations needed.',
      items: {
        type: 'OBJECT',
        properties: {
          type: {
            type: 'STRING',
            description:
              'One of: add_task, complete_task, schedule_task, add_goal, add_note, add_habit, save_memory',
          },
          taskId: {type: 'STRING', description: 'Existing task ID for complete_task or schedule_task'},
          title: {type: 'STRING', description: 'Title for task, goal, note, or habit'},
          dueDate: {type: 'STRING', description: 'YYYY-MM-DD date or empty string'},
          priority: {type: 'STRING', description: 'One of: مهم, متوسط, عادي'},
          reminderTime: {type: 'STRING', description: 'HH:MM 24-hour time or empty string'},
          tags: {type: 'ARRAY', items: {type: 'STRING'}},
          goalKind: {type: 'STRING', description: 'هدف or مشروع'},
          description: {type: 'STRING', description: 'Goal description'},
          initialTasks: {
            type: 'ARRAY',
            items: {type: 'STRING'},
            description: 'Optional starter tasks linked to a new goal',
          },
          noteCategory: {
            type: 'STRING',
            description: 'One of: شخصي, شغل, أفكار, حاجات مهمة',
          },
          content: {type: 'STRING', description: 'Note body content'},
          pinned: {type: 'BOOLEAN'},
          memoryCategory: {
            type: 'STRING',
            description: 'One of: شخصي, شغل, روتين, تفضيلات, علاقات, صحة',
          },
          fact: {type: 'STRING', description: 'Personal life fact to save in long-term memory'},
        },
        required: ['type'],
      },
    },
  },
  required: ['reply'],
};

export function buildAssistantSystemInstruction(lifeContext: Record<string, unknown>): string {
  const userName =
    typeof lifeContext.userName === 'string' && lifeContext.userName.trim()
      ? (lifeContext.userName as string).trim()
      : 'عمر';
  const profile = (lifeContext.profile ?? {}) as {
    roleAndWork?: string;
    dailyRoutine?: string;
    topPriorities?: string;
    personalNotes?: string;
    tone?: string;
  };
  const toneGuide =
    profile.tone === 'direct'
      ? 'اكتب بأسلوب مختصر وعملي ومباشر بنقاط واضحة بدون تطويل.'
      : profile.tone === 'coach'
        ? 'اتكلم كمدرب شخصي محفّز وعملي، شجع المستخدم بصدق وحاسبه بلطف على التزامه وأهدافه.'
        : 'اتكلم بالعامية المصرية الطبيعية الودودة والمنظمة، كأنك مساعد شخصي فاهم حياة المستخدم كويس.';

  return [
    `أنت المساعد الشخصي الذكي الخاص بـ "${userName}" داخل تطبيق "Omar's Life".`,
    toneGuide,
    'مهمتك إنك تفهم حياة المستخدم الحقيقية (ملفه الشخصي، ذاكرته طويلة المدى، مهامه، أهدافه، عاداته، ملاحظاته) وتساعده ينظم يومه وحياته فعلياً.',
    '',
    'خبراتك وشخصيتك:',
    '1. علم نفس: تفهم المشاعر والضغوط والتحفيز والعادات النفسية. لما المستخدم يفضفض أو يكون متوتر أو محبط، اسمعه بجدية، طمّنه، وساعده بخطوات عملية صغيرة، من غير ما تلقي عليه محاضرات. لو لاحظت علامات اكتئاب شديد أو إيذاء للنفس، شجّعه بلطف إنه يكلم مختص حقيقي.',
    '2. استشاري علاقات زوجية: تدّي نصايح عملية ومتوازنة في العلاقة مع مراته (وهي حامل حالياً)، التواصل، حل الخلافات، الدعم في فترة الحمل والاستعداد للبيبي. خليك حيادي، محترم، ومش بتحكم على حد.',
    '3. استشاري تسويق خبير: المستخدم صاحب شركة "Misr Pyramids Group" للتجميل والعناية الشخصية في مصر. افهم سوق مستحضرات التجميل المصري: التوزيع في الصيدليات والسوبر ماركت والهايبر ماركت، التسعير، البراندينج، السوشيال ميديا، العروض، وإدارة فرق المبيعات والمناديب. لما يسأل عن التسويق أو البيع، ادّيه خطط وأفكار عملية قابلة للتنفيذ مش كلام نظري.',
    '4. خبير أماكن في مصر: تعرف كل حتة في مصر — المحافظات والمدن والمناطق والشوارع المشهورة والمولات والأسواق والمستشفيات والجامعات والمواصلات والمسافات التقريبية بين المدن. لما يسأل عن أي مكان في مصر، جاوبه بأكبر قدر من المعلومات المفيدة والمنظمة.',
    '5. لغتك: رد دايماً بالعامية المصرية الطبيعية زي ما بيتكلم، وافهم كتابته بالمصري مهما كانت عامية أو مختصرة أو فيها أخطاء إملائية.',
    '',
    'القواعد الصارمة لتنفيذ الأوامر (actions):',
    '1. أضف عناصر في مصفوفة actions فقط لما المستخدم يطلب فعل حقيقي (زي إضافة مهمة، ترتيب/جدولة يومه، إنهاء مهمة، إنشاء هدف بخطواته، تسجيل ملاحظة، إضافة عادة، أو لما يذكر معلومة شخصية دائمة عن حياته تستاهل الحفظ في الذاكرة).',
    '2. لو المستخدم مجرد بيسأل أو بيفضفض ومفيش حاجة تتعدل في التطبيق، خلّي actions فاضية [].',
    '3. لما المستخدم يقول معلومة شخصية جديدة ومفيدة عن حياته (زي مواعيد شغله، هدف شخصي، تفضيل، رياضة، اسم مكان أو روتين) ومش موجودة فعلاً في memories، أضف action من نوع "save_memory" عشان تتعلمها وتفتكرها في كل المحادثات الجاية.',
    '4. لما يطلب "رتّبلي يومي" أو "جدول مهامي"، استخدم "schedule_task" مع الـ taskId الحقيقي من قائمة tasks المتاحة، وحدد dueDate بصيغة YYYY-MM-DD و reminderTime بصيغة HH:MM (24 ساعة) مناسبة لروتينه والوقت الحالي.',
    '5. لما يطلب خطة لهدف جديد، استخدم "add_goal" مع initialTasks (مصفوفة من ٣ إلى ٥ مهام عملية واضحة).',
    '6. لو رفع صورة أو ملف (ورقة مكتوبة، لقطة شاشة، جدول، PDF، إكسل، مستند نصي)، اقرأ محتواه بدقة واقترح أو نفّذ المهام/الملاحظات المطلوبة منه، ولخّص أهم النقاط اللي فيه.',
    '7. في حقل reply، اشرح بوضوح وبشكل مريح إيه اللي عملته أو نصحتك بيه بناءً على بياناته الحقيقية، بدون رموز برمجية أو JSON داخل reply.',
    '8. في suggestedFollowUps، اقترح ٢ أو ٣ أسئلة أو أوامر قصيرة وعملية جداً يقدر يضغط عليها فوراً.',
    '',
    'بيانات حياة المستخدم الحقيقية الآن (JSON):',
    JSON.stringify(lifeContext),
  ].join('\n');
}

function extractDataImage(imageDataUrl: string): {mimeType: string; data: string} | null {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    imageDataUrl,
  );
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    data: match[2],
  };
}

// Pull the live "reply" value out of a partially-received JSON buffer so the
// chat bubble can show the answer while the model is still writing it.
function extractPartialReply(buffer: string): string | null {
  const m = /"reply"\s*:\s*"/.exec(buffer);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = '';
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === '\\') {
      const n = buffer[i + 1];
      if (n === undefined) break;
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === 'u') {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else out += n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out.length > 0 ? out : null;
}

async function callModel(
  model: string,
  req: AssistantChatRequest,
  onPartial?: (text: string) => void,
): Promise<{ok: boolean; status: number; text?: string}> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  type Part = {
    text?: string;
    inlineData?: {mimeType: string; data: string};
    fileData?: {fileUri: string; mimeType: string};
  };
  const contents: Array<{role: 'user' | 'model'; parts: Part[]}> = [];

  for (const entry of (req.history ?? []).slice(-6)) {
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) continue;
    contents.push({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{text: entry.text.slice(0, 1000)}],
    });
  }

  const currentParts: Part[] = [];
  if (req.imageDataUrl) {
    const img = extractDataImage(req.imageDataUrl);
    if (img) currentParts.push({inlineData: img});
  }
  for (const att of req.attachments ?? []) {
    if (att.fileUri) {
      currentParts.push({fileData: {fileUri: att.fileUri, mimeType: att.mimeType}});
    } else if (att.data) {
      currentParts.push({inlineData: {mimeType: att.mimeType, data: att.data}});
    }
  }
  const hasFiles = currentParts.length > 0;
  currentParts.push({
    text:
      req.message.trim() ||
      (hasFiles
        ? 'اقرأ الملف/الصورة دي كويس ولخّصلي اللي فيها، ولو فيها مهام أو مواعيد مهمّة اقترح أو أضفها.'
        : ''),
  });
  contents.push({role: 'user', parts: currentParts});

  const is25 = model.startsWith('gemini-2.5') || model === 'gemini-flash-latest';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': req.apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{text: buildAssistantSystemInstruction(req.lifeContext)}],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1800,
          responseSchema: ASSISTANT_RESPONSE_SCHEMA,
          ...(is25 ? {thinkingConfig: {thinkingBudget: 0}} : {}),
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      clearTimeout(timeout);
      return {ok: false, status: res.status};
    }

    // Read the SSE stream: accumulate candidate text and surface the partial
    // reply as it grows.
    const reader = res.body?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      return {ok: false, status: res.status};
    }
    const decoder = new TextDecoder();
    let sseBuf = '';
    let acc = '';
    let lastPushed = '';
    const pushPartial = () => {
      if (!onPartial) return;
      const partial = extractPartialReply(acc);
      if (partial && partial !== lastPushed) {
        lastPushed = partial;
        onPartial(partial);
      }
    };
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      sseBuf += decoder.decode(value, {stream: true});
      let idx: number;
      while ((idx = sseBuf.indexOf('\n\n')) >= 0) {
        const event = sseBuf.slice(0, idx);
        sseBuf = sseBuf.slice(idx + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as {
              candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
            };
            const t = (chunk.candidates?.[0]?.content?.parts ?? [])
              .map((pp) => pp.text ?? '')
              .join('');
            if (t) {
              acc += t;
              pushPartial();
            }
          } catch {
            // Incomplete JSON event line: ignore, next event completes it.
          }
        }
      }
    }
    clearTimeout(timeout);
    const text = acc.trim();
    return {ok: true, status: res.status, text};
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return {ok: false, status: 0};
    }
    throw err;
  }
}

export async function chatWithAssistantClientSide(
  req: AssistantChatRequest,
  onPartial?: (text: string) => void,
): Promise<AssistantChatResult> {
  let lastStatus = 0;
  for (const model of MODEL_CHAIN) {
    try {
      const out = await callModel(model, req, onPartial);
      if (!out.ok) {
        lastStatus = out.status;
        // Retryable/unavailable statuses → try next model in the chain.
        continue;
      }
      if (!out.text) continue;

      let parsed: {
        reply?: string;
        suggestedFollowUps?: string[];
        actions?: Array<Record<string, unknown>>;
      };
      try {
        parsed = JSON.parse(out.text);
      } catch {
        parsed = {reply: out.text, suggestedFollowUps: [], actions: []};
      }

      return {
        reply:
          typeof parsed.reply === 'string' && parsed.reply.trim()
            ? parsed.reply.trim()
            : out.text,
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 3)
          : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
      };
    } catch {
      // Network failure → no point trying more models.
      return {error: 'تعذّر الاتصال بالإنترنت. اتأكد من الشبكة وجرّب تاني.'};
    }
  }

  if (lastStatus === 429) {
    return {error: 'وصلت للحد المؤقت لاستخدام المساعد الذكي. استنى شوية وجرّب تاني.'};
  }
  if (lastStatus === 403 || lastStatus === 400) {
    return {error: 'فيه مشكلة في صلاحية مفتاح الذكاء الاصطناعي. راجع الإعدادات.'};
  }
  return {error: 'حصلت مشكلة مؤقتة أثناء الاتصال بالمساعد الذكي. جرّب تبعت رسالتك تاني.'};
}
