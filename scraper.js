const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("Missing required environment variables (SUPABASE_URL, SUPABASE_KEY, or GEMINI_API_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COUNTRIES = [
  "ברזיל", "מקסיקו", "קולומביה", "צ'ילה", "ארגנטינה", 
  "פרו", "אורוגוואי", "אקוודור", "קוסטה ריקה"
];

async function researchCountryWithAI(country) {
  console.log(`🔍 מתחיל מחקר AI עבור: ${country}...`);

  const prompt = `
אתה אנליסט השקעות בכיר המתמחה בשווקים מתעוררים באמריקה הלטינית.
בצע מחקר מעמיק על חברות טכנולוגיה, פינטק, מסחר אלקטרוני וסטארט-אפים בולטים הפעילים ב${country} (חברות מקומיות או חברות אזוריות ששולטות בשוק של ${country}).

החזר רשימה של 5 חברות אמיתיות ומאומתות בלבד (אל תמציא חברות בשום אופן!), המשלבת 3 שכבות מחקר:
1. חברות עוגן ותיקות ו"חזקות" עם הכנסות מוכחות.
2. חברות שנמצאות ב"מומנטום" צמיחה חזק או "לקראת הנפקה" (Pre-IPO) בשנה האחרונה.
3. חברות "טרנדיות" שתפסו תאוצה ושיח ברשת ב-30 הימים האחרונים.

החזר את התשובה אך ורק כמערך JSON תקין (ללא סימני markdown מסביב וללא טקסט נוסף), במבנה הבא בדיוק עבור כל חברה:
[
  {
    "name": "שם החברה באנגלית",
    "country": "${country}",
    "sector": "סקטור בעברית (למשל: פינטק ותשלומים, מסחר אלקטרוני, בנקאות דיגיטלית)",
    "stage": "אחת מהאפשרויות בלבד: לקראת הנפקה | טרנדיות | חזקות | מומנטום",
    "status": "פרטית או סימול בורסאי אם ציבורית (למשל: פרטית, NYSE: NU, BMV: AMX)",
    "valuation": "שווי מוערך ריאלי (למשל: $2.5B או $800M)",
    "raised": "סך הון שגויס ריאלי (למשל: $450M או - אם ציבורית)",
    "interest_num": מספר שלם בין 40 ל-98 המשקף עניין חיפוש יחסי (Google Trends) ב-30 הימים האחרונים,
    "clicks": "הערכת קליקים חודשית לאתר (למשל: 250K)",
    "ad_spend": "הערכת הוצאה חודשית על פרסום (למשל: $180K)",
    "growth": "שיעור צמיחה שנתי מוערך (למשל: +45%)"
  }
]
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }], // מאפשר לסוכן לחפש מידע עדכני בגוגל בזמן אמת
        generationConfig: {
          temperature: 0.2 // שומר על דיוק עובדתי גבוה ומונע המצאות
        }
      })
    });

    const data = await response.json();
    if (!data.candidates || !data.candidates[0]) {
      console.error(`שגיאה בתשובת AI עבור ${country}:`, JSON.stringify(data));
      return [];
    }

    let rawText = data.candidates[0].content.parts[0].text;
    // ניקוי תגיות קוד אם המודל הוסיף אותן
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const companies = JSON.parse(rawText);
    return companies;
  } catch (error) {
    console.error(`שגיאה בעיבוד הנתונים עבור ${country}:`, error.message);
    return [];
  }
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר האוטונומי של LatAm-Invest...");
  
  for (const country of COUNTRIES) {
    const companies = await researchCountryWithAI(country);
    
    if (companies.length > 0) {
      // הוספת חותמת זמן עדכנית לכל חברה
      const enriched = companies.map(comp => ({
        ...comp,
        updated_at: new Date().toISOString()
      }));

      // שמירה/עדכון במסד הנתונים (Upsert לפי שם החברה ומדינה כדי למנוע כפילויות)
      for (const item of enriched) {
        const { data: existing } = await supabase
          .from('latam_companies')
          .select('id')
          .eq('name', item.name)
          .eq('country', item.country)
          .maybeSingle();

        if (existing) {
          await supabase.from('latam_companies').update(item).eq('id', existing.id);
        } else {
          await supabase.from('latam_companies').insert([item]);
        }
      }
      console.log(`✅ עודכנו/נוספו ${enriched.length} חברות אמיתיות עבור ${country}.`);
    }

    // השהייה של 4 שניות בין מדינה למדינה כדי לכבד מגבלות קצב חינמיות
    await new Promise(resolve => setTimeout(resolve, 4000));
  }

  console.log("🎉 הסריקה הושלמה בהצלחה! כל הנתונים מעודכנים ב-Supabase.");
}

runAgent();
