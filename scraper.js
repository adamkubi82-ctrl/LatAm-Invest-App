const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("❌ חסרים משתני סביבה (SUPABASE_URL, SUPABASE_KEY, או GEMINI_API_KEY)");
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
אתה אנליסט השקעות בכיר המתמחה באמריקה הלטינית.
בצע מחקר ומצא 8 חברות טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות או סטארט-אפים בולטים הפעילים משמעותית ב${country} (חברות מקומיות שהוקמו שם, או חברות אזוריות מובילות ששולטות בשוק המקומי של ${country}).

הרשימה חייבת לכלול חברות אמיתיות ומאומתות בלבד (אסור להמציא שמות!), ולשלב בין 4 הקטגוריות הבאות:
- "חזקות": חברות עוגן ותיקות ומבוססות.
- "מומנטום": חברות בצמיחה עסקית מהירה וגיוסי הון משמעותיים.
- "לקראת הנפקה": חברות בשלות שנמצאות בשלבי Pre-IPO.
- "טרנדיות": חברות שמייצרות עניין גבוה וחיפושים ברשת בתקופה האחרונה.

החזר אך ורק מערך JSON תקין (ללא טקסט מקדים, ללא הסברים וללא סימני \`\`\`json), במבנה הבא:
[
  {
    "name": "שם החברה באנגלית",
    "country": "${country}",
    "sector": "סקטור בעברית (למשל: פינטק ותשלומים, מסחר אלקטרוני, בנקאות)",
    "stage": "אחת מהמילים הבאות בלבד: לקראת הנפקה | טרנדיות | חזקות | מומנטום",
    "status": "פרטית או סימול בורסאי אם ציבורית (למשל: פרטית, NYSE: NU)",
    "valuation": "שווי מוערך (למשל: $2.5B או $450M)",
    "raised": "הון שגויס (למשל: $300M או - אם ציבורית)",
    "interest_num": 75,
    "clicks": "הערכת קליקים חודשית (למשל: 210K)",
    "ad_spend": "הוצאה חודשית מוערכת על פרסום (למשל: $150K)",
    "growth": "צמיחה שנתית (למשל: +42%)"
  }
]
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error(`❌ שגיאת API מ-Google עבור ${country}:`, data.error.message);
      return [];
    }

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.error(`⚠️ לא התקבל טקסט עבור ${country}`);
      return [];
    }

    let rawText = data.candidates[0].content.parts[0].text;
    // חילוץ מערך ה-JSON בלבד למקרה שהמודל הוסיף טקסט מסביב
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`⚠️ פורמט JSON לא תקין עבור ${country}:`, rawText.substring(0, 150));
      return [];
    }
    
    const companies = JSON.parse(jsonMatch[0]);
    return Array.isArray(companies) ? companies : [];
  } catch (error) {
    console.error(`❌ שגיאה בעיבוד הנתונים עבור ${country}:`, error.message);
    return [];
  }
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר האוטונומי (8 חברות למדינה)...");
  
  for (const country of COUNTRIES) {
    const companies = await researchCountryWithAI(country);
    
    if (companies.length > 0) {
      for (const comp of companies) {
        const item = {
          ...comp,
          interest_num: Number(comp.interest_num) || 65,
          updated_at: new Date().toISOString()
        };

        const { data: existing, error: selectError } = await supabase
          .from('latam_companies')
          .select('id')
          .eq('name', item.name)
          .eq('country', item.country)
          .maybeSingle();

        if (selectError) {
          console.error(`❌ שגיאת קריאה מ-Supabase (${item.name}):`, selectError.message);
          continue;
        }

        if (existing) {
          const { error: updateError } = await supabase.from('latam_companies').update(item).eq('id', existing.id);
          if (updateError) console.error(`❌ שגיאת עדכון (${item.name}):`, updateError.message);
        } else {
          const { error: insertError } = await supabase.from('latam_companies').insert([item]);
          if (insertError) console.error(`❌ שגיאת הכנסה (${item.name}):`, insertError.message);
        }
      }
      console.log(`✅ נשמרו/עודכנו ${companies.length} חברות עבור ${country}.`);
    } else {
      console.log(`⚠️ לא נמצאו תוצאות תקינות עבור ${country} בריצה זו.`);
    }

    // השהייה של 6 שניות בין מדינה למדינה כדי למנוע חסימת מכסה חינמית (Rate Limit)
    await new Promise(resolve => setTimeout(resolve, 6000));
  }

  console.log("🎉 הסריקה הושלמה!");
}

runAgent();
