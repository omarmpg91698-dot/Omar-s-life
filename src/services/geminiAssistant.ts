// Client-side Gemini assistant for the installed Android build.
// In AI Studio's hosted environment the app calls the server route
// /api/assistant/chat; the installed WebView build has no server, so it
// talks to the Gemini API directly with the key baked in at build time
// (VITE_GEMINI_API_KEY, injected from a GitHub secret in CI).

export interface AssistantChatRequest {
  message: string;
  imageDataUrl?: string;
  history: Array<{role: string; text: string}>;
  lifeContext: Record<string, unknown>;
  apiKey: string;
}

export interface AssistantChatResult {
  reply?: string;
  suggestedFollowUps?: string[];
  actions?: Array<Record<string, unknown>>;
  error?: string;
}

// Newest first: fall through the chain when a model is unavailable or busy.
const MODEL_CHAIN = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

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
    '6. لو رفع صورة (ورقة مكتوبة أو لقطة شاشة أو جدول)، اقرأ محتواها بدقة واقترح أو نفّذ المهام/الملاحظات المطلوبة منها.',
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

async function callModel(
  model: string,
  req: AssistantChatRequest,
): Promise<{ok: boolean; status: number; text?: string}> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}>;
  }> = [];

  for (const entry of (req.history ?? []).slice(-10)) {
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) continue;
    contents.push({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{text: entry.text.slice(0, 1500)}],
    });
  }

  const currentParts: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [];
  if (req.imageDataUrl) {
    const img = extractDataImage(req.imageDataUrl);
    if (img) currentParts.push({inlineData: img});
  }
  currentParts.push({
    text:
      req.message.trim() ||
      'اقرأ الصورة دي كويس ولخّصلي اللي فيها، ولو فيها مهام أو مواعيد مهمّة اقترح أو أضفها.',
  });
  contents.push({role: 'user', parts: currentParts});

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
          responseSchema: ASSISTANT_RESPONSE_SCHEMA,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return {ok: false, status: res.status};
    const data = (await res.json().catch(() => null)) as {
      candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
    } | null;
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
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
): Promise<AssistantChatResult> {
  let lastStatus = 0;
  for (const model of MODEL_CHAIN) {
    try {
      const out = await callModel(model, req);
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
