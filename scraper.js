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
  const prompt = `אתה אנליסט מחקר שוק והשקעות המתמחה באמריקה הלטינית.
מצא 8 חברות בולטות ומעניינות להשקעה הפועלות ב${country} (שילוב של חברות עוגן בורסאיות חזקות, חברות פינטק/טכנולוגיה צומחות, וחברות לקראת או אחרי הנפקה).
הקפד על נתונים אמיתיים ומאומתים בלבד — אל תמציא סכומי גיוס או שווי אם לא פורסמו (כתוב "לא פורסם").

החזר אך ורק מערך JSON תקני (ללא Markdown וללא טקסט מסביב) של 8 אובייקטים במבנה המדויק הבא:
[
  {
    "name": "שם החברה הרשמי",
    "country": "${country}",
    "industry": "הסקטור המרכזי בעברית (למשל: פינטק ובנקאות, אנרגיה, קמעונאות, לוגיסטיקה, תקשורת)",
    "status": "סטטוס מדויק (למשל: בורסאית NYSE: NU / פרטית • גיוס Series C / לקראת הנפקה)",
    "interest_level": "מספר שלם בין 55 ל-96 המייצג עניין ומומנטום תקשורתי",
    "stability_score": "מספר שלם בין 40 ל-97 המודד יציבות, ותק וביטחון מותגי בעיני קהל שמרן ובוגר (90+ לחברות ענק ותיקות ומוכרות כמו בנקים מסורתיים, אנרגיה או קמעונאות ענק; 40-65 לסטארט-אפים צעירים או קריפטו)",
    "audience_age": "טווח גילאים טבעי של המשקיע הטיפוסי (למשל: '45–65+ (בוגרים ומשפחות)' או '25–45 (צעירים ודיגיטליים)')",
    "tech_literacy": "רמת אוריינות טכנולוגית נדרשת: 'נמוכה (מותג יומיומי מוכר)' / 'בינונית' / 'גבוהה (מוצר פינטק/טכנולוגי מתקדם)'",
    "risk_profile": "התאמה לפרופיל סיכון: 'שמרני (חוששים ממסחר מורכב)' / 'מאוזן' / 'מחפשי צמיחה וסיכון'",
    "motivation": "המניע המרכזי למשקיע (למשל: כסף ותשואה (קר) / הזדמנות צמיחה / יציבות ודיבידנד)",
    "description": "הסבר קצר וברור (2 משפטים) מה החברה עושה בפועל ב${country}",
    "investment_thesis": "למה שווה להשקיע בה עכשיו (2 משפטים ממוקדים)",
    "catalyst": "מה מדווחים עליה בחדשות העסקיות לאחרונה (גיוס, התרחבות, דוחות, הנפקה)",
    "raised": "סכום הון שגויס (או 'לא פורסם')",
    "valuation": "שווי מוערך / שווי שוק עדכני (או 'לא פורסם')",
    "target_audience": "תיאור פרופיל המשקיע הפרטי (Retail Investor) ב${country} שהחברה הזו מתאימה לו ביותר",
    "creative_idea": "הצעה לקריאייטיב פרסומי לגיוס משקיעים פרטיים (Retail Investors) שרוצים להשקיע ולהרוויח ממניית/צמיחת החברה (אסור להציע לצרוך את המוצר או להוריד את האפליקציה! רק השקעה והכנסה נוספת מהמותג).",
    "source_url": "קישור לכתבה או מקור מידע רלוונטי (או מחרוזת ריקה אם אין)"
  }
]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error for ${country}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleanJson = rawText.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanJson);
}

async function run() {
  console.log('Starting LatAm companies research scraper...');
  const allRows = [];

  for (const country of COUNTRIES) {
    try {
      console.log(`Fetching companies for ${country}...`);
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

  console.log(`Total companies collected: ${allRows.length}. Updating Supabase...`);

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

  console.log('Successfully updated latam_companies table!');
}

run();
