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

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
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

// קריאה ל-Gemini עם חיפוש חי בגוגל (Google Search Grounding) לאימות נתונים בזמן אמת
async function callGeminiWithLiveSearch(prompt) {
  const models = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
  
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🌐 מריץ מחקר + חיפוש חי בגוגל באמצעות ${model} (ניסיון ${attempt})...`);
        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { 
                temperature: 0.1
              }
            })
          },
          90000
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
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return [];
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר המאומת עם חיפוש חי בגוגל (Google Search Grounding)...");
  
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

  // מעבדים מדינה-מדינה (או בזוגות) כדי שחיפוש הגוגל החי יאמת כל חברה לעומק
  for (let i = 0; i < countriesData.length; i++) {
    const c = countriesData[i];
    const context = `
=== מדינה: ${c.name} ===
כתבות חדשות אחרונות שנאספו:
${c.articles.map((a, idx) => `${idx + 1}. ${a.title} | URL: ${a.link}`).join('\n') || 'אין כתבות זמינות'}
טרנדים חמים: ${c.trends.join(', ') || 'אין'}
`;

    const prompt = `
אתה אנליסט השקעות בכיר המתמחה באמריקה הלטינית (השנה היא 2026).
לרשותך גישה לחיפוש חי בגוגל (Google Search). עליך להשתמש בחיפוש החי כדי לאמת כל נתון לפני שאתה מחזיר אותו!

נתוני הרקע שנאספו עבור ${c.name}:
${context}

המשימה שלך:
זהה ואמת בדיוק **8 חברות** טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות דיגיטלית או סטארט-אפים **פעילים בלבד** ב${c.name}.
תן עדיפות ראשונה לחברות שנוסדו ב${c.name}, והשלם עם חברות טק/פינטק לטינו-אמריקאיות הפעילות בה משמעותית.

חובת אימות בחיפוש גוגל חי (Google Search):
1. **בדוק בגוגל שהחברה עדיין פעילה ב-2026!** אם חברה נסגרה, פשטה רגל או הפסיקה פעילות ב${c.name} (כמו Frubana שנסגרה) — פסול אותה מיד ובחר חברה פעילה אחרת.
2. **איסור מוחלט על תאגידים אמריקאיים/גלובליים** (כמו Amazon, Google, Apple, Microsoft, Meta, Uber).
3. **אמת בחיפוש את מדינת המקור וסטטוס המסחר עבור שדה status:**
   - אם נוסדה ב${c.name} והיא פרטית: "פרטית • מקור מקומי (לא נסחרת)".
   - אם נוסדה במדינה אחרת ופועלת ב${c.name}: "פרטית • מקור: [שם מדינת המקור] (לא נסחרת)".
   - אם נסחרת בבורסה: ציין סימול מדויק (לדוגמה: "NYSE: GLOB" או "NASDAQ: DLO").
   - כתוב "לקראת הנפקה" **אך ורק** אם מצאת בחיפוש דיווח רשמי ופומבי על הגשת תשקיף (S-1 / F-1) או כוונת IPO קרובה.
4. **אמת בחיפוש את סבב הגיוס האחרון והשווי המדווח:**
   - חפש בגוגל "[שם החברה] funding round valuation" והבא את הנתון העדכני והמדויק ביותר כולל **שנה וסוג** (לדוגמה: "$85M (סבב B, 2025)", "$160M (מצטבר, 2026)", "$5.25B (2021)", או "$71M קו אשראי (2025)").
   - כתוב "לא פורסם" רק אם באמת לא פורסם נתון פומבי.

החזר אך ורק מערך JSON תקין (ללא טקסט מסביב וללא סימני \`\`\`json), במבנה הבא בדיוק:
[
  {
    "name": "שם החברה באנגלית",
    "country": "${c.name}",
    "industry": "סקטור בעברית",
    "status": "סטטוס מאומת כולל מדינת מקור",
    "interest_level": "גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית",
    "valuation": "שווי מאומת כולל שנה או 'לא פורסם'",
    "raised": "הון שגויס מאומת כולל שנה וסוג או 'לא פורסם'",
    "description": "2 משפטים ברורים בעברית: מה החברה עושה ומה המוצר המרכזי שלה.",
    "investment_thesis": "2 משפטים אנליטיים בעברית: למה שווה לעקוב או להשקיע בחברה הזו.",
    "catalyst": "משפט קצר בעברית: מה מדווחים עליה בחדשות לאחרונה (כולל ציון שנה).",
    "source_url": "קישור לכתבת המקור או מחרוזת ריקה"
  }
]
`;

    const companies = await callGeminiWithLiveSearch(prompt);
    console.log(`📦 ${c.name}: התקבלו ${companies.length} חברות מאומתות מחיפוש חי.`);

    for (const comp of companies) {
      if (!comp.name) continue;
      if (comp.name.toLowerCase().includes('frubana')) continue;

      const item = {
        name: comp.name,
        country: c.name,
        industry: comp.industry || 'פינטק וטכנולוגיה',
        status: comp.status || 'פרטית • מקור מקומי (לא נסחרת)',
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

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("🎉 הסריקה המאומתת הושלמה בהצלחה!");
  process.exit(0);
}

runAgent();
