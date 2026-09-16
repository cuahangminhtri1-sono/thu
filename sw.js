/* ============================================================
   sw.js  —  DÙNG CHUNG cho Sổ Nợ + Bán Hàng, TrọSafe, Cafe, NhàXe Pro
   (mọi app dùng Firebase 10.12.0). Chép 1 bản vào MỖI repo, đặt CẠNH
   index.html của app đó. Nhờ đặt tên cache theo scope nên KHÔNG cần
   sửa gì cho từng app — chép nguyên là được.
   ------------------------------------------------------------
   Đổi VER mỗi khi sửa file này (ở TẤT CẢ các bản).
   Lần này: v6 -> v7.

   ĐÂY LÀ LẦN CUỐI PHẢI ĐỔI VER VÌ LÝ DO "ĐẨY BẢN HTML MỚI".
   Từ nay chỉ cần đưa file .html mới lên là máy khách tự cập nhật,
   nhờ 2 điều đã được vá:

     • Trong file .html: app dò bản mới bằng ETag của CHÍNH TRANG ĐANG MỞ
       (trước đây luôn dò ./index.html nên app tên khác, ví dụ
        indexSNBH.html, không bao giờ phát hiện được bản mới).

     • Trong file này: khi tải trang, service worker ép HỎI LẠI MÁY CHỦ
       (cache:'no-cache') thay vì để trình duyệt trả thẳng bản trong bộ nhớ
       đệm HTTP. GitHub Pages gắn max-age cho .html, nếu không ép thì vừa
       bấm "Cập nhật ngay" xong vẫn nhận lại bản CŨ tới 10 phút, người
       dùng tưởng cập nhật hỏng — và app sẽ không nhắc lại lần nữa.
       Dùng 'no-cache' chứ KHÔNG dùng 'no-store': no-cache vẫn gửi ETag lên,
       file không đổi thì máy chủ trả 304 (vài trăm byte) và dùng lại bản
       trong máy  ->  luôn mới mà gần như không tốn dữ liệu di động.
       ('no-store' sẽ tải lại trọn ~1 MB mỗi lần mở app — quá tốn cho khách.)

   Chỉ đổi VER khi bạn thật sự SỬA NỘI DUNG FILE sw.js NÀY.
   ============================================================ */
const VER   = 'v7';
const SCOPE = self.registration.scope;               // mỗi app 1 cache riêng
const CACHE = 'app-' + VER + '-' + SCOPE;

/* Nạp sẵn ngay khi cài -> chỉ cần MỞ APP 1 LẦN khi có mạng là chạy offline được.
   Dùng allSettled: app nào không có file nào thì bỏ qua, không làm hỏng lượt cài. */
const PRECACHE = [
  './', './index.html', './indexSNBH.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js'
];

/* KHÔNG được đụng tới — để chúng tự đi mạng */
const BYPASS = [
  'firestore.googleapis.com', 'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'firebaselogging', 'google-analytics.com', 'img.vietqr.io'
];

/* Miền chứa thư viện — được phép lưu để chạy offline */
const LIB = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'esm.sh'];

/* ---- CÀI ĐẶT: nạp sẵn, KHÔNG skipWaiting ----
   App đã có sẵn cơ chế cập nhật an toàn (thanh "Cập nhật ngay" + postMessage('SKIP_WAITING')),
   nó chỉ áp dụng khi người dùng RẢNH. Nếu ở đây tự skipWaiting thì bản mới nhảy vào giữa lúc
   đang bán hàng / đang nhập liệu, và swReg.waiting luôn rỗng nên thanh báo mất tác dụng. */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async u => {
      try {
        const req = new Request(u, { cache: 'reload' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await c.put(u, res);
      } catch (err) { /* thiếu file này thì thôi */ }
    }));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    /* CHỈ xoá bản cũ CỦA CHÍNH APP NÀY. Phải so khớp đuôi chính xác: nếu 1 app đặt ở
       thư mục gốc thì indexOf() sẽ khớp nhầm và xoá mất cache của app kia. */
    await Promise.all(keys.map(k =>
      (k.slice(-(SCOPE.length + 1)) === ('-' + SCOPE) && k !== CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

/* App gửi CHUỖI 'SKIP_WAITING' khi người dùng bấm "Cập nhật ngay" */
self.addEventListener('message', e => {
  const d = e.data;
  if (d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                  // HEAD dò ETag đi thẳng ra mạng

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  for (let i = 0; i < BYPASS.length; i++) if (url.hostname.indexOf(BYPASS[i]) > -1) return;

  const isLib  = LIB.indexOf(url.hostname) > -1;
  const isSame = url.origin === self.location.origin;
  if (!isLib && !isSame) return;

  /* ---- 1) Trang chính: MẠNG TRƯỚC ----
     Nhận diện "trang" = đường dẫn kết thúc bằng "/" hoặc bằng ".html".
     Trước đây chỉ nhận "/" và "/index.html" nên app tên khác (indexSNBH.html)
     bị rơi xuống nhánh 2 (bản lưu trước) trong vài trường hợp. */
  const isPage = isSame && (/\/$/.test(url.pathname) || /\.html?$/i.test(url.pathname));
  if (req.mode === 'navigate' || isPage) {
    event.respondWith((async () => {
      try {
        /* Lấy đúng BẢN MỚI NHẤT trên máy chủ.
           KHÔNG gọi thẳng fetch(req): trình duyệt được phép trả bản trong bộ nhớ đệm
           HTTP (GitHub Pages gắn max-age cho .html) => vừa bấm "Cập nhật ngay" xong
           vẫn nhận lại bản CŨ, người dùng tưởng cập nhật hỏng.
           cache:'no-cache' = BẮT BUỘC hỏi lại máy chủ, nhưng vẫn gửi kèm ETag:
             • file KHÔNG đổi -> máy chủ trả 304, dùng lại bản trong máy (vài trăm byte)
             • file CÓ đổi    -> tải bản mới
           Vừa luôn mới, vừa gần như không tốn dữ liệu di động của khách. */
        let fresh = null;
        try {
          fresh = await fetch(new Request(req.url, {
            cache: 'no-cache', credentials: 'same-origin', redirect: 'follow'
          }));
        } catch (e1) { fresh = null; }
        if (!fresh) fresh = await fetch(req);        /* dự phòng: đúng cách cũ */
        if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
        return fresh;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true }))
            || (await caches.match('./index.html'))
            || (await caches.match('./indexSNBH.html'))
            || (await caches.match('./'))
            || new Response('<meta charset="utf-8"><h2>Chưa có bản lưu ngoại tuyến</h2>' +
                            '<p>Hãy mở app một lần khi có mạng.</p>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  /* ---- 2) Thư viện + file tĩnh: BẢN LƯU TRƯỚC, âm thầm làm mới ---- */
  event.respondWith((async () => {
    const c   = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { try { c.put(req, res.clone()); } catch (e) {} }
      return res;
    }).catch(() => null);
    if (hit) { net; return hit; }
    return (await net) || new Response('', { status: 504, statusText: 'offline' });
  })());
});
