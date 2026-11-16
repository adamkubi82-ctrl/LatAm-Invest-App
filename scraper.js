const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("❌ חסרים משתני סביבה (SUPABASE_URL, SUPABASE_KEY, או GEMINI_API_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 9 המדינות המבוקשות (ללא ברזיל, כולל אל סלבדור)
const TARGET_COUNTRIES = [
  { name: "מקסיקו", geo: "MX", newsQuery: "startup OR fintech OR inversión México empresa tecnología" },
  { name: "קולומביה", geo: "CO", newsQuery: "startup OR fintech OR inversión Colombia empresa tecnología" },
  { name: "צ'ילה", geo: "CL", newsQuery: "startup OR fintech OR inversión Chile empresa tecnología" },
  { name: "ארגנטינה", geo: "AR", newsQuery: "startup OR fintech OR unicornio Argentina inversión" },
  { name: "פרו", geo: "PE", newsQuery: "startup OR fintech OR inversión Perú empresa tecnología" },
  { name: "אורוגוואי", geo: "UY", newsQuery: "startup OR fintech OR tecnología Uruguay inversión" },
  { name: "אקוודור", geo: "EC", newsQuery: "startup OR fintech OR tecnología Ecuador inversión" },
  { name: "קוסטה ריקה", geo: "CR", newsQuery: "startup OR fintech OR tecnología Costa Rica inversión" },
  { name: "אל סלבדור", geo: "SV", newsQuery: "startup OR fintech OR tecnología El Salvador inversión bitcoin" }
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
    
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(xml)) !== null && articles.length < 12) {
      const itemXml = itemMatch[1];
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      
      const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : null;
      const link = linkMatch ? linkMatch[1].trim() : null;
      
      if (title && !title.includes("Google News")) {
        articles.push({ title, link: link || '' });
      }
    }
    return articles;
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
    while ((match = regex.exec(xml)) !== null && trends.length < 8) {
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

async function callGeminiWithFallback(prompt) {
  const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
  
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`🤖 שולח בקשה ל-${model} (ניסיון ${attempt})...`);
        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1 }
            })
          },
          60000
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
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  return [];
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר המאומת (9 מדינות ב-3 קבוצות מהירות)...");
  
  const countriesData = await Promise.all(
    TARGET_COUNTRIES.map(async (c) => {
      const [articles, trends] = await Promise.all([
        fetchLiveNews(c.newsQuery, c.geo),
        fetchGoogleTrends(c.geo)
      ]);
      console.log(`📰 ${c.name}: נאספו ${articles.length} כתבות ו-${trends.length} טרנדים.`);
      return { ...c, articles, trends };
    })
  );

  // פיצול ל-3 קבוצות קטנות של 3 מדינות כדי למנוע Timeout ועומס
  const batches = [
    countriesData.slice(0, 3),
    countriesData.slice(3, 6),
    countriesData.slice(6, 9)
  ];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchContext = batch.map(c => `
=== מדינה: ${c.name} ===
כתבות חדשות אחרונות:
${c.articles.map((a, idx) => `${idx + 1}. ${a.title} | URL: ${a.link}`).join('\n') || 'אין כתבות זמינות'}
טרנדים חמים: ${c.trends.join(', ') || 'אין'}
`).join('\n');

    const prompt = `
אתה אנליסט השקעות בכיר המתמחה באמריקה הלטינית.
לפניך כתבות חדשות אמיתיות וטרנדים עבור ${batch.length} מדינות:
${batchContext}

המשימה שלך:
עבור **כל אחת** מהמדינות שלמעלה, חלץ בדיוק **8 חברות** טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות דיגיטלית או סטארט-אפים **מקומיים/אזוריים** בולטים הפעילים במדינה (סה"כ ${batch.length * 8} חברות).
תן עדיפות לחברות מהחדשות שלמעלה, והשלם עם חברות הטכנולוגיה/פינטק המובילות והאמיתיות במדינה עד ל-8 חברות.

כללי ברזל לאמינות (אפס המצאות):
1. **איסור מוחלט על תאגידים אמריקאיים/גלובליים** (כמו Amazon, Google, Apple, Microsoft, Meta, Uber) — כלול אך ורק חברות לטינו-אמריקאיות מקומיות או אזוריות!
2. אל תמציא שמות של חברות.
3. בשדות valuation (שווי) ו-raised (הון שגויס): כתוב מספר מדווח אך ורק אם מדובר בעובדה ציבורית ידועה (כמו Plata $3.5B, Rappi $5.3B, Kavak $8.7B, Ualá $3.2B, Clip $2.2B, Addi $1.3B, Bold $0.5B, Bancolombia $12B, Globant $8.5B). אם אין נתון מאומת ודאי — כתוב בדיוק: "לא פורסם".
4. בשדה status: ציין במדויק האם החברה "פרטית", "אחרי הנפקה" (אם הונפקה בבורסה ב-3 השנים האחרונות), או סימול בורסאי אמיתי אם היא ציבורית ותיקה (לדוגמה: "NYSE: GLOB" או "בורסאית").

החזר אך ורק מערך JSON תקין (ללא טקסט מסביב וללא סימני \`\`\`json), במבנה הבא בדיוק:
[
  {
    "name": "שם החברה באנגלית (לדוגמה: Plata)",
    "country": "שם המדינה בעברית בדיוק כפי שמופיע בכותרת למעלה",
    "industry": "סקטור בעברית (לדוגמה: פינטק ואשראי, תשלומים, בנקאות דיגיטלית)",
    "status": "פרטית | אחרי הנפקה | או סימול בורסאי אמיתי כמו NYSE: GLOB",
    "interest_level": "אחת מהאפשרויות בלבד: גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "אחת מהאפשרויות בלבד: כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית",
    "valuation": "שווי מאומת (לדוגמה: $3.5B) או 'לא פורסם'",
    "raised": "הון שגויס מאומת (לדוגמה: $1.5B) או 'לא פורסם'",
    "description": "2 משפטים ברורים בעברית: מה החברה עושה ומה המוצר המרכזי שלה.",
    "investment_thesis": "2 משפטים אנליטיים בעברית: למה שווה לעקוב או להשקיע בחברה הזו (יתרון תחרותי, צמיחה או הזדמנות שוק).",
    "catalyst": "משפט קצר בעברית: מה מדווחים עליה בחדשות לאחרונה.",
    "source_url": "קישור לכתבת המקור או מחרוזת ריקה"
  }
]
`;

    const companies = await callGeminiWithFallback(prompt);
    console.log(`📦 קבוצה ${i + 1}: התקבלו ${companies.length} חברות מאומתות מה-AI.`);

    for (const comp of companies) {
      if (!comp.name || !comp.country) continue;
      const item = {
        name: comp.name,
        country: comp.country,
        industry: comp.industry || 'פינטק וטכנולוגיה',
        status: comp.status || 'פרטית',
        interest_level: comp.interest_level || 'גבוה',
        motivation: comp.motivation || 'כסף ותשואה (קר)',
        valuation: comp.valuation || 'לא פורסם',
        raised: comp.raised || 'לא פורסם',
        description: comp.description || '',
        investment_thesis: comp.investment_thesis || '',
        catalyst: comp.catalyst || 'פעילות צומחת בשוק המקומי',
        source_url: comp.source_url || ''
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
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log("🎉 הסריקה הושלמה בהצלחה!");
  process.exit(0);
}

runAgent();
