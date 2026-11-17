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
  { name: "מקסיקו", geo: "MX", newsQuery: "empresa tecnología OR fintech OR bolsa México" },
  { name: "קולומביה", geo: "CO", newsQuery: "empresa tecnología OR fintech OR bolsa Colombia" },
  { name: "צ'ילה", geo: "CL", newsQuery: "empresa tecnología OR fintech OR bolsa Chile" },
  { name: "ארגנטינה", geo: "AR", newsQuery: "empresa tecnología OR fintech OR unicornio Argentina" },
  { name: "פרו", geo: "PE", newsQuery: "empresa tecnología OR fintech OR inversión Perú" },
  { name: "אורוגוואי", geo: "UY", newsQuery: "empresa tecnología OR fintech Uruguay inversión" },
  { name: "אקוודור", geo: "EC", newsQuery: "empresa tecnología OR fintech Ecuador inversión" },
  { name: "קוסטה ריקה", geo: "CR", newsQuery: "empresa tecnología OR fintech Costa Rica inversión" },
  { name: "אל סלבדור", geo: "SV", newsQuery: "empresa tecnología OR fintech El Salvador inversión" }
];

async function fetchLiveNews(query, geo) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}+when:30d&hl=es-419&gl=${geo}&ceid=${geo}:es-419`;
    const res = await fetch(url);
    const xml = await res.text();
    
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(xml)) !== null && articles.length < 10) {
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

async function queryGeminiCountry(c, articles) {
  const context = articles.map((a, idx) => `${idx + 1}. ${a.title} | URL: ${a.link}`).join('\n') || 'אין כתבות זמינות';

  const prompt = `
אתה אנליסט השקעות באמריקה הלטינית (השנה היא 2026).
השתמש בחיפוש גוגל חי (Google Search) כדי לאמת נתונים עבור **8 חברות** טכנולוגיה, פינטק, בנקאות דיגיטלית, מסחר אלקטרוני או חדשנות **פעילות בלבד** ב${c.name}.

**חובת גיוון הרכב החברות (קריטי!):**
חלק את 8 החברות ב${c.name} כך:
- **2 עד 3 חברות בורסאיות / ציבוריות (נסחרות או אחרי הנפקה)** הפעילות משמעותית ב${c.name} (כמו MercadoLibre, Globant, dLocal, Bancolombia, Banco de Chile, Falabella, Copa Holdings, Grupo Aval, Nu Holdings וכו' — כל אחת רלוונטית למדינה זו).
- **3 חברות פרטיות בצמיחה מוכחת (מומנטום)** עם סבבי גיוס מאומתים.
- **2 עד 3 חברות פרטיות טרנדיות / חדשניות** שמופיעות בחדשות.

חדשות אחרונות ב${c.name}:
${context}

חוקי ברזל:
1. אסור לכלול חברות שנסגרו או הפסיקו פעילות (כמו Frubana).
2. אסור לכלול תאגידים אמריקאיים/גלובליים (Amazon, Google, Uber, Meta, Apple, Microsoft).
3. בשדה status:
   - נסחרת בבורסה: כתוב סימול בורסאי מדויק (לדוגמה: "NASDAQ: MELI", "NYSE: GLOB", "NYSE: CIB", "BCS: FALABELLA").
   - הונפקה ב-3 השנים האחרונות: "אחרי הנפקה (סימול)".
   - פרטית שנוסדה ב${c.name}: "פרטית • מקור מקומי (לא נסחרת)".
   - פרטית ממדינה אחרת בלטינו-אמריקה: "פרטית • מקור: [מדינת המקור] (לא נסחרת)".
   - "לקראת הנפקה" רק אם הוגש תשקיף או הוכרז IPO רשמית.
4. בשדה interest_level: גוון בין "גבוה מאוד", "גבוה", "במגמת עלייה", ו-"בינוני" בהתאם למציאות (אל תיתן לכולן "גבוה מאוד").
5. בשדות valuation ו-raised: אמת בחיפוש גוגל והצמד שנה (לדוגמה: "$85M (סבב B, 2025)" או שווי שוק לחברה בורסאית כמו "$95B (שווי שוק, 2026)").

החזר מערך JSON בלבד (ללא טקסט נוסף):
[
  {
    "name": "שם החברה באנגלית",
    "country": "${c.name}",
    "industry": "סקטור בעברית",
    "status": "סטטוס מאומת",
    "interest_level": "גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית",
    "valuation": "שווי מאומת כולל שנה או 'לא פורסם'",
    "raised": "הון שגויס מאומת כולל שנה או 'לא פורסם'",
    "description": "2 משפטים בעברית על מה החברה עושה.",
    "investment_thesis": "2 משפטים בעברית למה שווה לעקוב או להשקיע בה.",
    "catalyst": "משפט קצר בעברית על חדשות אחרונות.",
    "source_url": "קישור לכתבת המקור או מחרוזת ריקה"
  }
]
`;

  const models = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1 }
          })
        }
      );

      const data = await response.json();
      if (!data.error) {
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } else {
        console.warn(`⚠️ [${c.name}] ${model}: ${data.error.message}`);
      }
    } catch (err) {
      console.warn(`⚠️ [${c.name}] שגיאת רשת מול ${model}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 8000));
  }
  return [];
}

async function processCountry(c) {
  const { count: existingCount } = await supabase
    .from('latam_companies')
    .select('*', { count: 'exact', head: true })
    .eq('country', c.name);

  if (existingCount >= 8) {
    console.log(`✅ ${c.name}: כבר מלא (${existingCount} חברות) — מדלג.`);
    return false;
  }

  console.log(`🔍 מתחיל מחקר עבור ${c.name}...`);
  const articles = await fetchLiveNews(c.newsQuery, c.geo);
  const companies = await queryGeminiCountry(c, articles);
  console.log(`📦 ${c.name}: נשמרו ${companies.length} חברות מאומתות.`);

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
      await supabase.from('latam_companies').insert([item]);
    }
  }
  return true;
}

async function runAgent() {
  console.log("🚀 מפעיל סריקה מאוזנת (2 מדינות במקביל)...");
  
  for (let i = 0; i < TARGET_COUNTRIES.length; i += 2) {
    const chunk = TARGET_COUNTRIES.slice(i, i + 2);
    const results = await Promise.all(chunk.map(c => processCountry(c)));
    if (results.some(ran => ran === true) && i + 2 < TARGET_COUNTRIES.length) {
      await new Promise(r => setTimeout(r, 12000));
    }
  }

  console.log("🎉 הסריקה הושלמה בהצלחה!");
  process.exit(0);
}

runAgent();
