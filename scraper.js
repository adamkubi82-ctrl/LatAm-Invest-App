const { createClient } = require('@supabase/supabase-js');

// מושך את המפתחות הסודיים שלנו מתוך הכספת של גיטהאב
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// מאגר חברות באמריקה הלטינית
const companies = [
  { name: 'MercadoLibre', country: 'ארגנטינה', industry: 'מסחר אלקטרוני', description: 'האמזון של אמריקה הלטינית, ענקית מסחר ופינטק', why_invest: 'שליטה מוחלטת בשוק וצמיחה אדירה באזורים מתפתחים' },
  { name: 'Ualá', country: 'ארגנטינה', industry: 'פינטק', description: 'אפליקציה לניהול פיננסי אישי', why_invest: 'הכניסה מיליונים למערכת הבנקאית לראשונה' },
  { name: 'NotCo', country: "צ'ילה", industry: 'פודטק', description: 'ייצור תחליפי חלב ובשר בעזרת בינה מלאכותית', why_invest: 'שותפויות ענק עם חברות כמו קראפט-היינץ עקב חדשנות המותג' },
  { name: 'Rappi', country: 'קולומביה', industry: 'משלוחים ושירותים', description: 'אפליקציית "הכל-כלול" למשלוחים ושירותים פיננסיים', why_invest: 'מונופול מקומי עם שירותים שרק מתרחבים' },
  { name: 'Nubank (LatAm)', country: 'מקסיקו', industry: 'בנקאות דיגיטלית', description: 'הבנק הדיגיטלי הגדול בעולם שמתרחב כעת למקסיקו', why_invest: 'מותג שצעירים מתחברים אליו רגשית, מנצח את הבנקים הישנים' },
  { name: 'Kavak', country: 'מקסיקו', industry: 'רכב', description: 'פלטפורמה דיגיטלית לקנייה ומכירת רכבים', why_invest: 'היוניקורן הראשון של מקסיקו, פותר בעיית אמון בשוק' },
  { name: 'Crehana', country: 'פרו', industry: 'אד-טק (חינוך)', description: 'פלטפורמת למידה וקורסים אונליין', why_invest: 'צמיחה אדירה עקב מעבר להכשרות דיגיטליות מרחוק' },
  { name: 'dLocal', country: 'אורוגוואי', industry: 'תשלומים', description: 'פתרונות סליקה לשווקים מתפתחים', why_invest: 'ענקיות כמו נטפליקס ואמזון משתמשות בה כדי לחייב לקוחות שם' },
  { name: 'Kushki', country: 'אקוודור', industry: 'פינטק', description: 'תשתיות תשלומים דיגיטליים מודרניים', why_invest: 'שוק אקוודור והאזור עוברים דיגיטציה מהירה' },
  { name: 'Bitso', country: 'אל סלבדור', industry: 'קריפטו', description: 'בורסת הקריפטו הגדולה בלאטם', why_invest: 'אימוץ חוקי של ביטקוין במדינה דוחף את הפלטפורמה קדימה' }
];

// מנוע עדכון הנתונים
async function updateData() {
  console.log('מתחיל בעדכון הנתונים למסד...');

  // מנקה את הטבלה הישנה כדי להכניס נתונים טריים
  await supabase.from('latam_companies').delete().neq('id', 0);

  const updatedCompanies = companies.map(comp => {
    // סימולציה של ניתוח רגש מול כסף וגוגל טרנדס (כאן אפשר בהמשך לחבר API חי של מנועי חיפוש)
    const trends = ['גבוה מאוד', 'גבוה', 'בינוני', 'במגמת עלייה'];
    const motivations = ['כסף ותשואה (קר)', 'חיבור רגשי (מותג/קהילה)', 'כסף ותשואה (קר)', 'חדשנות טכנולוגית'];
    
    return {
      ...comp,
      interest_level: trends[Math.floor(Math.random() * trends.length)],
      motivation: motivations[Math.floor(Math.random() * motivations.length)],
      clicks: Math.floor(Math.random() * 50000) + 5000,
      investment_amount: 'לא זמין פומבית'
    };
  });

  const { error } = await supabase.from('latam_companies').insert(updatedCompanies);
  
  if (error) {
    console.error('שגיאה בהכנסת נתונים:', error);
  } else {
    console.log('הנתונים עודכנו בהצלחה! האתר מעודכן.');
  }
}

updateData();
