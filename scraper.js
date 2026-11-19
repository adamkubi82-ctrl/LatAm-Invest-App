const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('Missing required environment variables (SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COUNTRIES = [
  'מקסיקו',
  'קולומביה',
  "צ'ילה",
  'ארגנטינה',
  'פרו',
  'אורוגוואי',
  'אקוודור',
  'קוסטה ריקה',
  'אל סלבדור'
];

async function fetchCountryCompanies(country) {
  const prompt = `השתמש בחיפוש החי בגוגל (Google Search) כדי לאתר מידע עדכני משנת 2026 על 8 חברות בולטות ומעניינות להשקעה הפועלות ב${country} (שילוב של חברות עוגן בורסאיות חזקות, חברות פינטק/טכנולוגיה צומחות עם חדשות מהחודשים האחרונים, וחברות לקראת או אחרי הנפקה).

חוקי ברזל למניעת המצאות:
1. הסתמך אך ורק על ממצאים אמיתיים מתוצאות החיפוש בגוגל.
2. אל תמציא סכומי גיוס או שווי שוק אם לא הופיעו בחיפוש — כתוב "לא פורסם".
3. בשדה "source_url" שים אך ורק קישור אמיתי לכתבה או מקור שמצאת בחיפוש (או מחרוזת ריקה "" אם אין).

החזר אך ורק מערך JSON תקני (ללא טקסט הקדמה וללא סיכום) של 8 אובייקטים במבנה המדויק הבא:
[
  {
    "name": "שם החברה הרשמי",
    "country": "${country}",
    "industry": "הסקטור המרכזי בעברית (למשל: פינטק ובנקאות, אנרגיה, קמעונאות, לוגיסטיקה, תקשורת)",
    "status": "סטטוס מדויק (למשל: בורסאית NYSE: NU / פרטית • גיוס Series C / לקראת הנפקה)",
    "interest_level": "מספר שלם בין 55 ל-96 המייצג עניין ומומנטום תקשורתי בהתבסס על כמות ועדכניות החדשות שנמצאו בחיפוש",
    "stability_score": "מספר שלם בין 40 ל-97 המודד יציבות, ותק וביטחון מותגי בעיני קהל שמרן ובוגר (90+ לחברות ענק ותיקות ומוכרות כמו בנקים מסורתיים, אנרגיה או קמעונאות ענק; 40-65 לסטארט-אפים צעירים או קריפטו)",
    "audience_age": "טווח גילאים טבעי של המשקיע הטיפוסי (למשל: '45–65+ (בוגרים ומשפחות)' או '25–45 (צעירים ודיגיטליים)')",
    "tech_literacy": "רמת אוריינות טכנולוגית נדרשת: 'נמוכה (מותג יומיומי מוכר)' / 'בינונית' / 'גבוהה (מוצר פינטק/טכנולוגי מתקדם)'",
    "risk_profile": "התאמה לפרופיל סיכון: 'שמרני (חוששים ממסחר מורכב)' / 'מאוזן' / 'מחפשי צמיחה וסיכון'",
    "motivation": "המניע המרכזי למשקיע (למשל: כסף ותשואה (קר) / הזדמנות צמיחה / יציבות ודיבידנד)",
    "description": "הסבר קצר וברור (2 משפטים) מה החברה עושה בפועל ב${country}",
    "investment_thesis": "למה שווה להשקיע בה עכשיו (2 משפטים ממוקדים)",
    "catalyst": "מה מדווחים עליה בחדשות העסקיות לאחרונה לפי החיפוש בגוגל (גיוס, התרחבות, דוחות, הנפקה)",
    "raised": "סכום הון שגויס כפי שמופיע במקורות (או 'לא פורסם')",
    "valuation": "שווי מוערך / שווי שוק עדכני כפי שמופיע במקורות (או 'לא פורסם')",
    "target_audience": "תיאור פרופיל המשקיע הפרטי (Retail Investor) ב${country} שהחברה הזו מתאימה לו ביותר",
    "creative_idea": "הצעה לקריאייטיב פרסומי לגיוס משקיעים פרטיים (Retail Investors) שרוצים להשקיע ולהרוויח ממניית/צמיחת החברה (אסור להציע לצרוך את המוצר או להוריד את האפליקציה! רק השקעה והכנסה נוספת מהמותג).",
    "source_url": "כתובת URL אמיתית מתוך תוצאות החיפוש בגוגל"
  }
]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini live search error for ${country}: ${errText}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const rawText = candidate?.content?.parts?.map(p => p.text || '').join('') || '[]';

  // שליפת קישורים אמיתיים ומאומתים מתוך מטא-דאטה של חיפוש גוגל (Grounding Chunks)
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const verifiedUrls = chunks
    .map(ch => ch.web?.uri)
    .filter(uri => uri && uri.startsWith('http'));

  // חילוץ מערך ה-JSON מתוך התשובה
  const startIdx = rawText.indexOf('[');
  const endIdx = rawText.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`No valid JSON array found in response for ${country}`);
  }

  const jsonString = rawText.slice(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonString);

  // חיזוק אמינות הקישורים: אם המודל לא החזיר לינק תקין, הצמדת לינק מאומת מתוצאות החיפוש
  return parsed.map((item, idx) => {
    const hasValidUrl = item.source_url && String(item.source_url).startsWith('http') && !String(item.source_url).includes('vertexaisearch');
    const fallbackVerified = verifiedUrls[idx % verifiedUrls.length] || verifiedUrls[0] || '';
    return {
      ...item,
      source_url: hasValidUrl ? item.source_url : fallbackVerified
    };
  });
}

async function run() {
  console.log('Starting LatAm live Google Search research scraper...');
  const allRows = [];

  for (const country of COUNTRIES) {
    try {
      console.log(`Live searching Google for companies in ${country}...`);
      const items = await fetchCountryCompanies(country);
      if (Array.isArray(items)) {
        for (const c of items) {
          if (!c.name) continue;
          allRows.push({
            name: String(c.name).trim(),
            country: country,
            industry: c.industry || 'פינטק וטכנולוגיה',
            status: c.status || 'פרטית',
            interest_level: String(c.interest_level || '70'),
            stability_score: Number(c.stability_score) || null,
            audience_age: c.audience_age || null,
            tech_literacy: c.tech_literacy || null,
            risk_profile: c.risk_profile || null,
            motivation: c.motivation || 'כסף ותשואה (קר)',
            description: c.description || '',
            investment_thesis: c.investment_thesis || '',
            catalyst: c.catalyst || '',
            raised: c.raised || 'לא פורסם',
            valuation: c.valuation || 'לא פורסם',
            target_audience: c.target_audience || '',
            creative_idea: c.creative_idea || '',
            source_url: c.source_url || '',
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Error processing ${country}:`, err.message);
    }
  }

  if (allRows.length === 0) {
    console.error('No companies fetched. Aborting DB update.');
    process.exit(1);
  }

  console.log(`Total live companies collected: ${allRows.length}. Updating Supabase...`);

  const { error: delError } = await supabase
    .from('latam_companies')
    .delete()
    .neq('id', 0);

  if (delError) {
    console.error('Delete error:', delError);
  }

  const { error: insError } = await supabase
    .from('latam_companies')
    .insert(allRows);

  if (insError) {
    console.error('Insert error:', insError);
    process.exit(1);
  }

  console.log('Successfully updated latam_companies table with live Google Search data!');
}

run();
