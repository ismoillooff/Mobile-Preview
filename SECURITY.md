# 🔒 Xavfsizlik siyosati

## Qo‘llab-quvvatlanadigan versiyalar

| Versiya | Xavfsizlik yangilanishlari |
| --- | --- |
| 1.0.x | ✅ |

## Zaiflik haqida xabar berish

Xavfsizlik bilan bog‘liq muammo topsangiz, iltimos, uni **ochiq Issue sifatida joylamang**. Buning o‘rniga dasturchiga to‘g‘ridan-to‘g‘ri yozing:

- Telegram: [@ismoillooff](https://t.me/ismoillooff)
- GitHub: [@ismoillooff](https://github.com/ismoillooff)

Xabarda quyidagilarni ko‘rsating:

1. Muammo tavsifi va uning ta’siri;
2. Qayta takrorlash qadamlari (iloji bo‘lsa, namuna sahifa yoki fayl);
3. Mobile Preview versiyasi va Windows versiyasi.

Xabar olingandan keyin imkon qadar tez javob beriladi va tuzatish tayyor bo‘lgach yangi versiya Releases sahifasida e’lon qilinadi.

## Ilovaning xavfsizlik modeli

- Ko‘rilayotgan sahifalar Node.js’ga kirish huquqisiz, sandbox qilingan `<webview>` ichida ishlaydi.
- Renderer jarayoni `contextIsolation` bilan ishlaydi va faqat `preload.js` dagi cheklangan API’dan foydalanadi.
- Kamera, mikrofon, joylashuv va bildirishnomalar uchun har bir saytdan ruxsat so‘raladi.
- O‘z-o‘zidan imzolangan sertifikatlar faqat `localhost` va lokal tarmoq manzillari uchun qabul qilinadi.
- Papka serveri standart holatda faqat `127.0.0.1` da ishlaydi; lokal tarmoqqa faqat QR oynasi ochilganda chiqadi.
- EXE fayllarni faqat shu repozitoriyning Releases sahifasidan yuklab oling.
