const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("❌ חסרים משתני סביבה (SUPABASE_URL, SUPABASE_KEY, או GEMINI_API_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_COUNTRIES = [
  { name: "ברזיל", geo: "BR", newsQuery: "startup OR fintech OR unicórnio Brasil investimento" },
  { name: "מקסיקו", geo: "MX", newsQuery: "startup OR fintech OR inversión México empresa tecnología" },
  { name: "קולומביה", geo: "CO", newsQuery: "startup OR fintech OR inversión Colombia empresa tecnología" },
  { name: "צ'ילה", geo: "CL", newsQuery: "startup OR fintech OR inversión Chile empresa tecnología" },
  { name: "ארגנטינה", geo: "AR", newsQuery: "startup OR fintech OR unicornio Argentina inversión" },
  { name: "פרו", geo: "PE", newsQuery: "startup OR fintech OR inversión Perú empresa tecnología" },
  { name: "אורוגוואי", geo: "UY", newsQuery: "startup OR fintech OR tecnología Uruguay inversión" },
  { name: "אקוודור", geo: "EC", newsQuery: "startup OR fintech OR tecnología Ecuador inversión" },
  { name: "קוסטה ריקה", geo: "CR", newsQuery: "startup OR fintech OR tecnología Costa Rica inversión" }
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchLiveNews(query, geo) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}+when:30d&hl=es-419&gl=${geo}&ceid=${geo}:es-419`;
    const res = await fetchWithTimeout(url, {}, 8000);
    const xml = await res.text();
    
    const titles = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && titles.length < 15) {
      const title = match[1] || match[2];
      if (title && !title.includes("Google News")) {
        titles.push(title);
      }
    }
    return titles;
  } catch (e) {
    return [];
  }
}

async function fetchGoogleTrends(geo) {
  try {
    const url = `https://trends.google.com/trending/rss?geo=${geo}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    const xml = await res.text();
    
    const trends = [];
    const regex = /<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && trends.length < 10) {
      const term = match[1];
      if (term && !term.includes("Daily Search Trends")) {
        trends.push(term);
      }
    }
    return trends;
  } catch (e) {
    return [];
  }
}

// קריאה ל-Gemini עם ניסיונות חוזרים ומעבר בין מודלים במקרה של עומס
async function callGeminiWithFallback(prompt) {
 const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
  
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🤖 שולח בקשה ל-${model} (ניסיון ${attempt})...`);
        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2 }
            })
          },
          45000
        );

        const data = await response.json();
        if (!data.error) {
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = rawText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } else {
          console.warn(`⚠️ ${model} החזיר: ${data.error.message}`);
        }
      } catch (err) {
        console.warn(`⚠️ שגיאת תקשורת מול ${model}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  return [];
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר המרוכז (בקשה 1 לכל המדינות כדי לעקוף מגבלת 5 בקשות בדקה)...");
  
  // שלב 1: איסוף נתונים חיים לכל המדינות במקביל
  const countriesData = await Promise.all(
    TARGET_COUNTRIES.map(async (c) => {
      const [news, trends] = await Promise.all([
        fetchLiveNews(c.newsQuery, c.geo),
        fetchGoogleTrends(c.geo)
      ]);
      console.log(`📰 ${c.name}: נאספו ${news.length} כתבות ו-${trends.length} טרנדים.`);
      return { ...c, news, trends };
    })
  );

  // פיצול ל-2 קבוצות (5 מדינות + 4 מדינות) = רק 2 בקשות API סה"כ!
  const batches = [countriesData.slice(0, 5), countriesData.slice(5)];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchContext = batch.map(c => `
=== מדינה: ${c.name} ===
חדשות אחרונות: ${c.news.join(' | ') || 'אין'}
טרנדים חמים: ${c.trends.join(', ') || 'אין'}
`).join('\n');

    const prompt = `
אתה אנליסט השקעות בכיר המתמחה באמריקה הלטינית.
לפניך נתוני חדשות וטרנדים חיים שנאספו עכשיו עבור ${batch.length} מדינות:
${batchContext}

המשימה שלך:
עבור **כל אחת** מהמדינות שלמעלה, חלץ בדיוק **8 חברות** טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות דיגיטלית או סטארט-אפים אמיתיים ובולטים הפעילים באותה מדינה (סה"כ ${batch.length * 8} חברות). תן עדיפות לחברות שמופיעות בחדשות שלמעלה, והשלם עם חברות הטק/פינטק המובילות במדינה. אל תמציא שמות של חברות.

החזר אך ורק מערך JSON תקין (ללא טקסט מסביב וללא סימני \`\`\`json), במבנה הבא בדיוק:
[
  {
    "name": "שם החברה באנגלית (לדוגמה: Nubank)",
    "country": "שם המדינה בעברית בדיוק כפי שמופיע בכותרת למעלה",
    "industry": "סקטור בעברית (לדוגמה: פינטק, מסחר אלקטרוני, בנקאות דיגיטלית)",
    "interest_level": "אחת מהאפשרויות בלבד: גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "אחת מהאפשרויות בלבד: כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית"
  }
]
`;

    const companies = await callGeminiWithFallback(prompt);
    console.log(`📦 קבוצה ${i + 1}: התקבלו ${companies.length} חברות מה-AI.`);

    for (const comp of companies) {
      if (!comp.name || !comp.country) continue;
      const item = {
        name: comp.name,
        country: comp.country,
        industry: comp.industry || 'טכנולוגיה ופינטק',
        interest_level: comp.interest_level || 'גבוה',
        motivation: comp.motivation || 'כסף ותשואה (קר)'
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

    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log("🎉 הסריקה הושלמה בהצלחה!");
  process.exit(0);
}

runAgent();
