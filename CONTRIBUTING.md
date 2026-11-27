# 🤝 Hissa qo‘shish

Mobile Preview’ni yaxshilashga yordam berganingiz uchun rahmat!

## Xato haqida xabar berish

[Issues](https://github.com/ismoillooff/Mobile-Preview/issues) bo‘limida yangi Issue oching va quyidagilarni yozing:

- nima qilganingiz va nima kutganingiz;
- aslida nima bo‘lgani (iloji bo‘lsa, skrinshot bilan);
- qaysi qurilma tanlangani va sahifa manzili turi (dev server, papka yoki internet sayt);
- Mobile Preview va Windows versiyasi.

## Yangi qurilma qo‘shish

Qurilmalar katalogi `src/renderer/devices.js` faylidagi `PRESETS` ro‘yxatida. Yangi qurilma uchun quyidagilar kerak:

```js
{ id: 'galaxy-s25', name: 'Galaxy S25', group: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', model: 'SM-S931B' }
```

- `w`, `h` — CSS pikseldagi viewport (Chrome’da `innerWidth` / `screen.height` qiymatlari);
- `dpr` — `devicePixelRatio`;
- `frame` — `island`, `notch`, `punch`, `classic` yoki `tablet`.

Ma’lumot manbasini Pull Request tavsifida ko‘rsating.

## Kod yozish

1. Repozitoriyni fork qiling va alohida branch oching: `git checkout -b feature/qisqa-nom`.
2. `npm install` va `npm start` bilan ilovani ishga tushiring.
3. O‘zgarishdan keyin smoke testni ishlating: `npm run smoke -- .smoke`.
4. Interfeys matnlarini uchala tilda ham qo‘shing: `src/renderer/i18n.js` (uz, ru, en).
5. Kod, izoh va commit xabarlarini ingliz tilida yozing; commit xabari qisqa va mazmunli bo‘lsin.
6. Pull Request oching va o‘zgarishni skrinshot bilan tushuntiring.

## Kod uslubi

- Build bosqichi yo‘q: renderer oddiy HTML, CSS va JavaScript’da yozilgan.
- Ranglar va o‘lchamlar `styles.css` dagi CSS o‘zgaruvchilari (token) orqali beriladi.
- Yangi IPC kanallarini faqat `preload.js` orqali, aniq va tor API sifatida oching.
