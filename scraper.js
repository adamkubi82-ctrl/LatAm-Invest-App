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

// פונקציית עזר עם הגבלת זמן (Timeout) כדי למנוע תקיעות
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
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
    const res = await fetchWithTimeout(url, {}, 7000);
    const xml = await res.text();
    
    const titles = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && titles.length < 25) {
      const title = match[1] || match[2];
      if (title && !title.includes("Google News")) {
        titles.push(title);
      }
    }
    return titles;
  } catch (e) {
    console.warn(`⚠️ דילוג על משיכת חדשות עבור ${geo} (חריגת זמן או חסימה)`);
    return [];
  }
}

async function fetchGoogleTrends(geo) {
  try {
    const url = `https://trends.google.com/trending/rss?geo=${geo}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    const xml = await res.text();
    
    const trends = [];
    const regex = /<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && trends.length < 20) {
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

async function analyzeCountryData(countryObj) {
  console.log(`🔍 אוסף נתונים עבור: ${countryObj.name}...`);

  const [newsHeadlines, trendingNow] = await Promise.all([
    fetchLiveNews(countryObj.newsQuery, countryObj.geo),
    fetchGoogleTrends(countryObj.geo)
  ]);

  console.log(`   📰 נמצאו ${newsHeadlines.length} כתבות ו-${trendingNow.length} חיפושים חמים.`);

  const prompt = `
אתה אנליסט השקעות בכיר המתמחה באמריקה הלטינית.
לפניך נתונים חיים שנאספו מהרשת עבור ${countryObj.name}:

כותרות חדשות עסקיות וטכנולוגיות מ-30 הימים האחרונים ב${countryObj.name}:
${newsHeadlines.length > 0 ? newsHeadlines.map(t => `- ${t}`).join('\n') : 'אין כותרות זמינות - התבסס על החברות המובילות והבולטות ביותר במדינה.'}

חיפושים חמים כרגע ב-Google Trends ב${countryObj.name}:
${trendingNow.length > 0 ? trendingNow.join(', ') : 'לא זמין'}

המשימה שלך:
זהה וחלץ בדיוק 8 חברות טכנולוגיה, פינטק, מסחר אלקטרוני, בנקאות דיגיטלית או סטארט-אפים אמיתיים ובולטים הפעילים ב${countryObj.name} (תן עדיפות לחברות שמופיעות בחדשות שלמעלה או בטרנדים, והשלם עם חברות הטק/פינטק המובילות במדינה עד ל-8 חברות). אל תמציא שמות של חברות.

החזר אך ורק מערך JSON תקין (ללא טקסט מסביב וללא סימני \`\`\`json), במבנה הבא בדיוק:
[
  {
    "name": "שם החברה באנגלית (לדוגמה: Nubank או Kavak)",
    "country": "${countryObj.name}",
    "industry": "סקטור בעברית (לדוגמה: פינטק, מסחר אלקטרוני, בנקאות דיגיטלית)",
    "interest_level": "אחת מהאפשרויות בלבד: גבוה מאוד | גבוה | במגמת עלייה | בינוני",
    "motivation": "אחת מהאפשרויות בלבד: כסף ותשואה (קר) | חיבור רגשי (מותג/קהילה) | חדשנות טכנולוגית"
  }
]
`;

  try {
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    }, 20000);

    const data = await response.json();
    if (data.error) {
      console.error(`❌ שגיאת API מ-Google עבור ${countryObj.name}:`, data.error.message);
      return [];
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`⚠️ פורמט JSON לא תקין עבור ${countryObj.name}`);
      return [];
    }
    
    const companies = JSON.parse(jsonMatch[0]);
    return Array.isArray(companies) ? companies : [];
  } catch (error) {
    console.error(`❌ שגיאה בעיבוד הנתונים עבור ${countryObj.name}:`, error.message);
    return [];
  }
}

async function runAgent() {
  console.log("🚀 מפעיל את סוכן המחקר האוטונומי...");
  
  for (const countryObj of TARGET_COUNTRIES) {
    const companies = await analyzeCountryData(countryObj);
    
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
      console.log(`✅ נשמרו/עודכנו ${companies.length} חברות עבור ${countryObj.name}.`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log("🎉 הסריקה הושלמה בהצלחה!");
}

runAgent();
