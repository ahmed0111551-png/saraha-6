# Anonymous Messaging API

Node.js + Express + MongoDB (Mongoose). كل الـ endpoints تحت `/api/v1`.

## التشغيل

```bash
npm install
cp .env.example .env        # عدّل JWT_SECRET و JWT_REFRESH_SECRET و MONGO_URI
npm run dev                 # أو npm start
```

- في وضع التطوير لو مفيش SMTP، كود الـ OTP ولينك إعادة الباسورد بيتطبعوا في الـ console.
- لإنشاء أدمن: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=StrongPass123 npm run seed:admin`
- للاختبار الشامل (محتاج MongoDB شغال): `npm test`

## الـ Endpoints

| Method | Path | الوصف |
|---|---|---|
| POST | `/auth/register` | `name, username, email, password` |
| POST | `/auth/login` | لو الـ 2FA مفعّل يرجّع `requires2FA` و`tempToken` |
| POST | `/auth/2fa/verify` | `tempToken, code` |
| POST | `/auth/2fa/enable` / `confirm` / `disable` | تفعيل (كود على الإيميل) / تأكيد / إلغاء (`password`) |
| POST | `/auth/refresh` / `/auth/logout` | تجديد التوكن / خروج |
| POST | `/auth/forgot-password` | `email` |
| POST | `/auth/reset-password` | `token, newPassword` |
| GET | `/users/me` | بياناتي |
| GET | `/users/by-username/:username` | عشان تجيب `receiverId` |
| POST | `/messages` | `receiverId, content` (مجهولة) |
| GET | `/messages/inbox` | الرسائل الواصلة (بدون مرسل) |
| GET | `/messages/:messageId` | المرسل بيظهر بس بعد القبول |
| POST | `/messages/:messageId/identity-requests` | طلب كشف الهوية (`pending`) |
| GET | `/identity-requests/received?status=` | المرسل يشوف الطلبات اللي جاتله |
| GET | `/identity-requests/sent?status=` | الطلبات اللي أنا عملتها |
| PATCH | `/identity-requests/:requestId/accept` / `reject` | قبول (وبيعمل Conversation) / رفض |
| GET | `/conversations` | محادثاتي |
| POST | `/conversations/:conversationId/messages` | إرسال رسالة |
| GET | `/conversations/:conversationId/messages?page=&limit=` | الرسائل (الأحدث أولًا) |
| GET | `/admin/users?banned=&q=` | (أدمن) قائمة المستخدمين |
| POST | `/admin/users/:userId/ban` / `unban` | (أدمن) حظر / فك حظر (`reason` اختياري) |

الـ Header للـ endpoints المحمية: `Authorization: Bearer <accessToken>`

## قرارات التصميم

- **المرسل مخفي من الأساس:** حقل `sender` في `Message` و`IdentityRequest` عليه `select: false`، فمش بيرجع في أي query إلا لما الكود يطلبه صراحة.
- **طلب واحد لكل رسالة** (`unique` على `message`)، والقرار (قبول/رفض) مينفعش يتغيّر. القبول والرفض بيتعملوا atomically.
- **Authorization:** أي حد مش طرف في المحادثة يرجعله `403`.
- **الحظر:** بيتشيك على كل request في الـ middleware، وبيمسح الـ refresh token. المستخدم المحظور مبيظهرش في البحث ومينفعش يستقبل رسائل.
- **2FA:** كود 6 أرقام على الإيميل، صلاحيته 5 دقايق، و5 محاولات بحد أقصى، وبيتخزن مشفّر (SHA-256).
- **Forgot password:** نفس الرد سواء الإيميل موجود أو لا، والتوكن مشفّر ولمرة واحدة وصلاحيته 15 دقيقة، وبعد التغيير بيتعمل logout من كل الأجهزة.
- **Access token** عمره 15 دقيقة، و**refresh token** عمره 7 أيام مع rotation.
- كل المدخلات بتتشيك إنها `string` (حماية من NoSQL injection)، وفي Rate Limiting على الـ auth والرسائل.
