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
בצע מחקר ומצא 8 חברות טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות או סטארט-אפים בולטים הפעילים משמעותית ב${country} (חברות מקומיות או אזוריות מובילות).

החזר אך ורק מערך JSON תקין (ללא טקסט מסביב וללא סימני \`\`\`json), במבנה הבא בדיוק (אלו שמות העמודות במסד הנתונים):
[
  {
    "name": "שם החברה באנגלית (לדוגמה: Nubank או Kavak)",
    "country": "${country}",
    "industry": "סקטור בעברית (לדוגמה: פינטק, מסחר אלקטרוני, בנקאות דיגיטלית)",
    "interest_level": "אחת מהאפשרויות בלבד: גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "אחת מהאפשרויות בלבד: כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית"
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
        generationConfig: { temperature: 0.2 }
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error(`❌ שגיאת API מ-Google עבור ${country}:`, data.error.message);
      return [];
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`⚠️ פורמט JSON לא תקין עבור ${country}`);
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
  console.log("🚀 מפעיל את סוכן המחקר האוטונומי...");
  
  for (const country of COUNTRIES) {
    const companies = await researchCountryWithAI(country);
    
    if (companies.length > 0) {
      for (const comp of companies) {
        const item = {
          name: comp.name,
          country: comp.country,
          industry: comp.industry,
          interest_level: comp.interest_level,
          motivation: comp.motivation
        };

        const { data: existing } = await supabase
          .from('latam_companies')
          .select('id')
          .eq('name', item.name)
          .eq('country', item.country)
          .maybeSingle();

        if (existing) {
          await supabase.from('latam_companies').update(item).eq('id', existing.id);
        } else {
          const { error } = await supabase.from('latam_companies').insert([item]);
          if (error) console.error(`❌ שגיאת הכנסה (${item.name}):`, error.message);
        }
      }
      console.log(`✅ נשמרו/עודכנו ${companies.length} חברות עבור ${country}.`);
    }

    await new Promise(resolve => setTimeout(resolve, 6000));
  }

  console.log("🎉 הסריקה הושלמה בהצלחה!");
}

runAgent();
