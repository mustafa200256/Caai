# مصطفى حسين — موقع التشويق (Teaser)

موقع ثابت (HTML + CSS + JavaScript) بدون أي مكتبات خارجية ولا Backend ولا مفاتيح سرية.

## التشغيل
```bash
# الخيار 1
python3 -m http.server 3000      # ثم افتح http://localhost:3000

# الخيار 2
npm start                        # يستخدم npx serve
```
يعمل أيضاً على أي استضافة ملفات ثابتة (Netlify / Vercel / GitHub Pages / cPanel) بنسخ المجلد كما هو.
افتح الموقع عبر http(s) وليس بالنقر المزدوج على index.html، حتى يعمل الـFade للموسيقى بشكل كامل.

## الهيكل
```
index.html            الصفحة + SEO + Open Graph
css/style.css         التصميم
js/config.js          الإعدادات (تاريخ الإطلاق، مسار الموسيقى، مستوى الصوت)
js/audio.js           مشغل الموسيقى + أصوات الواجهة
js/particles.js       شبكة الجسيمات (Canvas خفيف)
js/main.js            التفاعلات والحركات
public/audio/requiem.mp3   ملف الموسيقى (المرفوع منك)
public/favicon.svg, public/og-image.png
```

## العد التنازلي
اتركه كما هو (`launchDate: null`) ليظهر COMING SOON. عند تحديد موعد حقيقي ضعه في `js/config.js`:
`launchDate: "2026-12-01T20:00:00+03:00"`

## عند النشر
في `index.html` غيّر `og:image` و`twitter:image` إلى رابط كامل، مثل `https://your-domain.com/public/og-image.png`.
