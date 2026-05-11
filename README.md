# Tóm tắt khóa học LLM Engineering

Trang web tĩnh tổng hợp kiến thức 8 tuần của khóa học, kèm code mẫu và link tới notebook gốc.

## Mở web

Chỉ cần mở `index.html` trong trình duyệt là chạy — không cần build, không cần server.

```bash
# Windows
start tom-tat-khoa-hoc/index.html

# macOS
open tom-tat-khoa-hoc/index.html
```

> Nếu trình duyệt chặn `file://` đối với `<script src>` (hiếm), chạy local server:
> `python -m http.server 8000` rồi truy cập `http://localhost:8000/tom-tat-khoa-hoc/`.

## Cấu trúc

```
tom-tat-khoa-hoc/
├── index.html          # Trang chính
├── styles.css          # Theme (dark/light)
├── app.js              # Logic render bài học, search, theme toggle
├── data/
│   ├── manifest.js     # Danh sách toàn bộ tuần/ngày của khóa học
│   ├── week1-day1.js   # Tóm tắt bài Week 1 - Day 1
│   └── ...             # Các bài khác (sẽ bổ sung dần)
└── README.md
```

## Thêm một bài học mới

1. Tạo file `data/weekN-dayM.js`:

```js
window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: N, day: M,
    title: "...",
    notebooks: ["weekN/dayM.ipynb"],
    topics: ["..."],
    summary: "Markdown text...",
    keyPoints: ["..."],
    code: [{ title: "...", lang: "python", code: "..." }]
});
```

2. Thêm thẻ `<script src="data/weekN-dayM.js"></script>` vào `index.html`.

Sidebar và progress bar sẽ tự cập nhật.

## Nguồn dữ liệu

- **Phụ đề bài giảng:** `srt-extract/<week>/...srt` — dùng để tóm tắt nội dung từng video.
- **Code mẫu:** notebook `weekN/dayM.ipynb` trong repo gốc.

## Trạng thái

Tóm tắt được build dần để tránh vượt giới hạn context. Bài đã hoàn thành sẽ hiển thị ở sidebar; bài chưa làm được đánh dấu ⏳ "chưa tóm tắt".
# llm-engineering
