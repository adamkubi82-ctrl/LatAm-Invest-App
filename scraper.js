import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

async function fetchCountryData(country) {
  const prompt = `
אתה אנליסט מחקר השקעות ומודיעין שיווקי בכיר המתמחה באמריקה הלטינית.
בצע חיפוש עדכני ברשת ומצא 8 חברות טכנולוגיה, פינטק, מסחר אלקטרוני או צמיחה בולטות הפועלות ב${country}.
הקפד לכלול רק חברות שבאמת פועלות ורלוונטיות ב${country} (אל תכלול חברות אמריקאיות גלובליות כמו Amazon, או חברות שנסגרו כמו Frubana).

עבור כל חברה, החזר אובייקט JSON מדויק בעברית עם השדות הבאים:
1. "name": שם החברה באנגלית.
2. "country": "${country}"
3. "industry": סקטור הפעילות בעברית (למשל: "פינטק ובנקאות דיגיטלית").
4. "status": סטטוס החברה וטיקר אם נסחרת (למשל: "נסחרת (NYSE: NU)", "לקראת הנפקה • דיווח רשמי", "אחרי הנפקה (NASDAQ)", או "פרטית • מקור מקומי (לא נסחרת)"). סמן "לקראת הנפקה" רק אם יש דיווח פומבי רשמי.
5. "interest_level": ציון מספרי שלם (בין 40 ל-98) המחושב לפי הנוסחה המשוקללת הבאה (אל תיתן ציונים זהים לכל החברות, הבחן ביניהן במדויק):
   - 35%: נוכחות פרסומית ו-Ads (קמפיינים ברשת, מודעות של ברוקרים/אפליקציות מסחר שמקדמים השקעה בה, ושיווק ממומן).
   - 25%: היכרות ברחוב ומוכרות מותג בקרב הציבור הרחב במדינה.
   - 25%: נחשקות, Hype, סמל סטטוס וסנטימנט חיובי ברשתות החברתיות.
   - 15%: מומנטום חדשותי ונפח חיפושים ב-30 הימים האחרונים.
6. "score_breakdown": משפט קצר המפרט את הסיבה לציון המשוקלל (למשל: "נוכחות פרסומית חזקה של פלטפורמות השקעה + מותג מוכר בכל בית").
7. "motivation": המניע המרכזי של המשקיעים בחברה (למשל: "כסף ותשואה (קר)", "צמיחה וטכנולוגיה", "סטטוס וחדשנות", "יציבות ודיבידנד").
8. "catalyst": מה מדווחים עליה כרגע — אירוע עסקי או חדשותי עדכני עם תאריך/שנה.
9. "raised": סך ההון שגויס כולל שנה וסבב (למשל: "$300M (סבב F, 2026)" או "חברה ציבורית").
10. "valuation": שווי שוק או שווי מוערך אחרון כולל שנה (למשל: "$8.7B (2026)" או "לא פורסם").
11. "description": 2 משפטים ברורים על מה החברה עושה ואיך היא מרוויחה כסף.
12. "investment_thesis": 2 משפטים על היתרון התחרותי ולמה מעניין לעקוב אחריה או להשקיע בה.
13. "audience_evidence": הבסיס העובדתי לניתוח הקהל — חפש נתונים אמיתיים מדוחות החברה, הודעות לעיתונות או סקירות שוק לגבי פרופיל המשתמשים/משקיעים שלה (למשל: "על פי נתוני החברה, מעל 70% מלקוחותיה הם משתמשי מובייל צעירים" או "חברת B2B המשרתת מנהלי כספים ועסקים קטנים"). אל תמציא נתונים דמוגרפיים אם לא פורסמו.
14. "target_audience": 2 שורות ממוקדות הנגזרות ישירות מהבסיס העובדתי: פרופיל קהל היעד (טווח גילאים משוער רק אם יש בסיס, מעמד/תפקיד, סגנון חיים ויעד ההשקעה/שימוש).
15. "creative_idea": הצעה קונקרטית לקריאייטיב לבאנר פרסומי (כותרת ראשית קצרה, מסר מניע לפעולה וכיוון ויזואלי שמתאים לקהל היעד).
16. "source_url": קישור ישיר (URL) לכתבה חדשותית או מקור מידע אמיתי שתומך בנתונים.

החזר אך ורק מערך JSON תקני (ללא טקסט מקדים וללא סימני markdown).
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3
    }
  });

  let rawText = response.text || '[]';
  rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const startIdx = rawText.indexOf('[');
  const endIdx = rawText.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1) {
    rawText = rawText.substring(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(rawText);
  return parsed.map(item => ({
    ...item,
    interest_level: String(item.interest_level)
  }));
}

async function run() {
  console.log('Starting LatAm AI Research Agent...');
  const allCompanies = [];

  for (const country of COUNTRIES) {
    try {
      console.log(`Researching ${country}...`);
      const companies = await fetchCountryData(country);
      console.log(`Found ${companies.length} companies for ${country}`);
      allCompanies.push(...companies);
    } catch (err) {
      console.error(`Error fetching ${country}:`, err.message);
    }
  }

  if (allCompanies.length > 0) {
    console.log(`Clearing old records and inserting ${allCompanies.length} fresh records...`);
    await supabase.from('latam_companies').delete().neq('id', 0);
    const { error } = await supabase.from('latam_companies').insert(allCompanies);
    if (error) {
      console.error('Supabase insert error:', error);
      process.exit(1);
    }
    console.log('Database updated successfully!');
  } else {
    console.error('No companies fetched, keeping existing records.');
    process.exit(1);
  }
}

run();
