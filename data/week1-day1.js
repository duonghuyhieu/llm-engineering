window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 1,
    day: 1,
    title: "LLM là gì · Frontier vs Open-source · Anatomy của một LLM call",
    notebooks: ["week1/day1.ipynb"],
    topics: [
        "Triết lý khóa học: action-first, không slide deck",
        "LLM là gì — định nghĩa và bản chất next-token prediction",
        "Frontier vs Open-source — landscape và trade-off",
        "Hai cách tiêu thụ LLM: Chat UI vs API",
        "Setup môi trường: UV, Cursor, .env",
        "Anatomy của một LLM call qua Chat Completions API",
        "Project đầu tay: Website Summarizer end-to-end"
    ],
    summary: `
## 1. Triết lý: action-first

Tuần 1 không bắt đầu bằng slide. Lý do: 70% thông tin về LLM trong slide đã lỗi thời sau 6 tháng. Cách bền vững nhất là **làm trước, hiểu sau** — chạy LLM thật trên máy, gọi API thật, build sản phẩm thật, rồi mới rút ra principles.

Mục tiêu sau 8 tuần: build một **autonomous multi-agent system** gồm 7 agent hợp tác giải bài toán business — fine-tune được open-source model competitive với GPT.

## 2. LLM là gì — bản chất

Large Language Model là một mạng neural khổng lồ được huấn luyện trên hàng nghìn tỷ token text, với **một mục tiêu duy nhất**: dự đoán token tiếp theo trong một sequence.

Mọi khả năng "biết toán", "viết code", "dịch ngôn ngữ" của ChatGPT đều là *emergent behavior* — hệ quả phụ của task next-token-prediction được thực hiện ở quy mô đủ lớn (hàng tỷ params, hàng nghìn tỷ tokens).

3 khái niệm cần phân biệt:
- **Model** = file weights (\`.safetensors\`) chứa hàng tỷ số
- **Inference** = chạy model với input để sinh output
- **Provider** = công ty host model và bán quyền truy cập (OpenAI, Anthropic…)

## 3. Frontier vs Open-source — hai thế giới song song

| Tiêu chí | Frontier (closed-source) | Open-source (open-weight) |
|---|---|---|
| Ví dụ | GPT-5, Claude 4.5, Gemini 2.5, Grok | LLaMA, Mistral, DeepSeek, Phi, Qwen |
| Cách dùng | API trả phí | Tải về tự chạy / API rẻ |
| Sức mạnh | Top tier | Tiệm cận, đôi chỗ vượt |
| Privacy | Data đi qua server provider | Chạy local, data không rời máy |
| Customization | Fine-tune giới hạn | Fine-tune tự do |
| Chi phí | Theo token | Hardware ban đầu, sau đó miễn phí |

"Open-source" thực ra là **open-weight** — trọng số public, nhưng training data và quy trình thường không được công bố đầy đủ. Cộng đồng vẫn quen gọi là open-source.

## 4. Hai cách tiêu thụ LLM

- **Chat UI** (ChatGPT, Claude.ai): cho người dùng cuối. Có context auto-managed, tích hợp tool (web search, code interpreter, memory). Subscription model.
- **API**: cho developer build sản phẩm. Stateless mặc định — không tự nhớ. Pay-per-token. Bạn kiểm soát hoàn toàn prompt và behavior.

Khóa học này tập trung **API** vì đó là cách build sản phẩm AI thật. ChatGPT là tool, API là building block.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model:** Coi LLM như một *function thuần* \`f(messages) → text\`. Không có session, không có database. Mọi state ngoài input đều là *ảo giác* tạo bởi developer (bạn) gửi lại context mỗi lần."
        },
        {
            type: "warn",
            text: "**Đừng nhầm Chat UI với API.** ChatGPT (UI) có hàng tá tính năng ẩn — search, memory dài hạn, code interpreter, file upload. API thuần KHÔNG có. Prototype trên ChatGPT thấy 'làm được' không có nghĩa API cũng làm được như vậy mà không thêm work."
        }
    ],
    keyPoints: [
        "**LLM = next-token predictor.** Mọi 'trí thông minh' biểu hiện đều là hệ quả phụ của task này khi scale đủ lớn.",
        "**Frontier ≠ Open-source về license, không chỉ về performance.** Open-weight (LLaMA) khác với truly open (cả code + data + recipe — cực hiếm).",
        "**System prompt KHÔNG phải security boundary.** Đừng tin nó để chặn user làm điều xấu — luôn validate output ở application layer.",
        "**API stateless mặc định.** 'Trí nhớ' của ChatGPT là frontend gửi lại history mỗi lần (Day 4 sẽ học sâu).",
        "**API key có format prefix nhận dạng.** OpenAI: \`sk-proj-...\`, Anthropic: \`sk-ant-...\`, Google: \`AIz...\`. Validate format trước khi gọi tiết kiệm hàng giờ debug."
    ],
    code: [
        {
            title: "Bước 1 — Chạy LLM open-source ngay trên máy với Ollama",
            lang: "bash",
            before: `
**Ý tưởng cốt lõi:** trước khi nói chuyện code và API, cảm nhận LLM thật đang chạy ở đâu đó. Ollama là cách đơn giản nhất — một wrapper open-source quản lý việc download, load, và serve các open-source LLM trên máy bạn.

Sau khi cài Ollama từ [ollama.com](https://ollama.com), mở terminal và chạy:
`,
            code: `# Tải về và chạy LLaMA 3.2 (3B params, ~2GB)
ollama run llama3.2

# Hoặc các model khác:
ollama run deepseek-r1:8b      # reasoning model nhỏ
ollama run phi3:medium          # Microsoft Phi-3
ollama run llama3.2:1b          # 1B params, cho máy yếu`,
            after: `
**Điều gì đang xảy ra dưới capo:**
- Lần đầu: Ollama download model weights (~2GB cho LLaMA 3.2) từ registry của họ
- Load model vào RAM hoặc VRAM (nếu có GPU)
- Mở một REPL (chat loop) trong terminal

Sau khi prompt \`>>>\` xuất hiện, bạn gõ câu hỏi → model trả lời. **Mọi token được sinh trên máy bạn**, không có API call, không tốn tiền, data không rời máy. Đây là feel khác hẳn so với ChatGPT — bạn thực sự "sở hữu" AI.
`
        },
        {
            title: "Bước 2 — Validate OpenAI API key trong .env",
            lang: "python",
            before: `
**Vì sao step này quan trọng:** đa số bugs "OpenAI không hoạt động" của học viên đến từ 3 nguyên nhân: (1) key chưa được load, (2) key sai prefix (paste nhầm key dạng cũ), (3) có ký tự trắng đầu/cuối (paste từ Notepad). Validate trước khi gọi API giúp catch ngay từ đầu.

\`.env\` file để ở thư mục gốc repo, chứa \`OPENAI_API_KEY=sk-proj-...\`. File này nằm trong \`.gitignore\` — không bao giờ commit lên Git.
`,
            code: `import os
from dotenv import load_dotenv

# Load environment variables in a file called .env
load_dotenv(override=True)
api_key = os.getenv('OPENAI_API_KEY')

# Check the key
if not api_key:
    print("No API key was found - please head over to the troubleshooting notebook!")
elif not api_key.startswith("sk-proj-"):
    print("An API key was found, but it doesn't start sk-proj-; please check you're using the right key")
elif api_key.strip() != api_key:
    print("An API key was found, but it looks like it might have space or tab characters at the start or end - please remove them")
else:
    print("API key found and looks good so far!")`,
            after: `
**Diễn giải từng dòng:**

- \`load_dotenv(override=True)\`: đọc file \`.env\` ở cùng thư mục, set giá trị vào \`os.environ\`. Tham số \`override=True\` quan trọng — nếu env shell đã có giá trị cũ (vd từ session trước), nó *force overwrite* bằng giá trị trong file. Bỏ qua \`override\` → có khi sửa \`.env\` mà code vẫn dùng key cũ.

- \`os.getenv('OPENAI_API_KEY')\`: lấy key đã được set. Trả về \`None\` nếu không tồn tại — đó là lý do check \`if not api_key\` trước.

- Series \`elif\`: validate **trước khi gọi API**. Key OpenAI từ 2024+ bắt đầu \`sk-proj-\` (project-scoped, secure hơn org-wide key cũ \`sk-...\`). Phát hiện sai format ở đây tránh được lỗi \`AuthenticationError\` khó hiểu.

- \`api_key.strip() != api_key\`: detect trailing/leading whitespace — một bug rất phổ biến khi copy-paste từ trình duyệt.
`
        },
        {
            title: "Bước 3 — Hello world: gọi LLM đầu tiên",
            lang: "python",
            before: `
**Anatomy của một LLM call.** Mọi request tới Chat Completions API (OpenAI, Gemini, Claude qua compat layer, Ollama…) đều có cùng structure: list **messages** với 3 role chính (\`system\`, \`user\`, \`assistant\`).
`,
            code: `# To give you a preview -- calling OpenAI with these messages is this easy.

from openai import OpenAI

openai = OpenAI()   # tự đọc OPENAI_API_KEY từ env

message = "Hello, GPT! This is my first ever message to you! Hi!"
messages = [{"role": "user", "content": message}]

response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=messages
)
response.choices[0].message.content`,
            after: `
**Mổ xẻ:**

- \`OpenAI()\` không truyền argument: client tự tìm \`OPENAI_API_KEY\` trong env. Đây là pattern an toàn — **không hardcode key** trong code.

- \`messages=[{"role": "user", "content": "..."}]\`: format chuẩn của Chat Completions API. Mỗi message là một dict với 2 field bắt buộc: \`role\` và \`content\`. Role có thể là \`system\` (định nghĩa vai trò), \`user\` (input), \`assistant\` (output từ AI ở turn trước).

- \`response.choices[0].message.content\`: cấu trúc deeply-nested vì API hỗ trợ trả về nhiều candidate (\`n>1\`). Mặc định \`n=1\` → luôn lấy \`choices[0]\`.

**Output mẫu:** \`"Hello! Welcome — happy to see your first message. How can I help you today?"\`

Đây là call đơn giản nhất có thể. Mọi pattern phức tạp sau này (RAG, agents, fine-tuning) đều build trên skeleton 3 dòng này.
`
        },
        {
            title: "Bước 4 — Fetch website content",
            lang: "python",
            before: `
**Project đầu tay: Website Summarizer.** Bài toán đơn giản nhưng cover được pattern căn bản của mọi GenAI app: *input thực tế (web) → prompt engineering → LLM call → render output*.

Helper \`fetch_website_contents\` được cung cấp sẵn trong \`scraper.py\` của repo. Nó dùng \`requests + BeautifulSoup\` để lấy text từ HTML, strip script/style/nav.
`,
            code: `from scraper import fetch_website_contents
from IPython.display import Markdown, display

# Let's try out this utility
ed = fetch_website_contents("https://edwarddonner.com")
print(ed)`,
            after: `
**Output:** một string dài chứa toàn bộ text visible của trang.

**Lưu ý quan trọng:** scraper này chỉ hoạt động với HTML tĩnh.
- Trang JavaScript-heavy (React, Vue SPAs) → không lấy được content
- Trang protected CloudFront → có thể trả 403
- Trang lớn (hàng MB text) → vượt context window của LLM

Trong production cần upgrade scraper với Playwright/Selenium hoặc dùng service như Firecrawl. Day 1 dùng phiên bản đơn giản để focus vào LLM logic.
`
        },
        {
            title: "Bước 5 — Thiết kế System prompt và User prompt",
            lang: "python",
            before: `
**System prompt vs User prompt — phân biệt quan trọng.**

- **System prompt**: định nghĩa "nhân vật" và "luật chơi" cho toàn bộ conversation — tone, format, vai trò, constraints. Gửi 1 lần ở đầu.
- **User prompt**: tin nhắn cụ thể, thay đổi theo từng request.

Cùng một user input, đổi system prompt → output hoàn toàn khác. Đây là điểm bán hàng lớn nhất của prompt engineering.
`,
            code: `# Define our system prompt - you can experiment with this later,
# changing the last sentence to 'Respond in markdown in Spanish.'

system_prompt = """
You are a snarky assistant that analyzes the contents of a website,
and provides a short, snarky, humorous summary, ignoring text that might be navigation related.
Respond in markdown. Do not wrap the markdown in a code block - respond just with the markdown.
"""

# Define our user prompt

user_prompt_prefix = """
Here are the contents of a website.
Provide a short summary of this website.
If it includes news or announcements, then summarize these too.

"""`,
            after: `
**Phân tích system prompt — 4 instruction quan trọng:**

1. *"You are a snarky assistant"* → định nghĩa **persona**. LLM sẽ adjust tone.
2. *"analyzes the contents of a website"* → định nghĩa **task domain**.
3. *"ignoring text that might be navigation related"* → **filter logic**. LLM đủ thông minh để bỏ qua menu items, footer.
4. *"Respond in markdown. Do not wrap the markdown in a code block"* → **format constraint**. Without this, model có thể bọc output trong \`\`\`markdown ... \`\`\` (LLM hay làm thế khi user nói "respond in markdown") làm hỏng render.

**Pattern user prompt prefix:** template cố định + content động (sẽ ghép vào sau). Pattern này dễ refactor và reuse hơn là build string ad-hoc.
`
        },
        {
            title: "Bước 6 — Hàm messages_for() ghép thành format chuẩn",
            lang: "python",
            before: `
Bước cuối trước khi gọi API: ghép system + user prompt thành format \`messages\` mà OpenAI yêu cầu. Tách thành function riêng cho **modularity** — sau này có thể test với nhiều system prompt khác nhau dễ dàng.
`,
            code: `# See how this function creates exactly the format above

def messages_for(website):
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt_prefix + website}
    ]`,
            after: `
**Function trả về:** list of 2 dicts. System message đứng đầu (convention, không phải bắt buộc nhưng best practice). User message ghép \`user_prompt_prefix\` cố định + content scrape động.

**Một câu hỏi đáng nghĩ:** Tại sao nhồi content website vào *user* message, không phải *system*? Vì system là "luật chơi" (không đổi), user là "input cụ thể" (thay đổi mỗi call). Đặt sai → confused model + khó cache prompt sau này.
`
        },
        {
            title: "Bước 7 — Ghép tất cả thành hàm summarize()",
            lang: "python",
            before: `
**Ráp pipeline:** Input URL → Output Markdown summary. Đây là API contract bạn expose cho phần còn lại của app (sau này có thể là Gradio UI, API endpoint, v.v.).
`,
            code: `# And now: call the OpenAI API. You will get very familiar with this!

def summarize(url):
    website = fetch_website_contents(url)
    response = openai.chat.completions.create(
        model = "gpt-4.1-mini",
        messages = messages_for(website)
    )
    return response.choices[0].message.content


# A function to display this nicely in the output, using markdown

def display_summary(url):
    summary = summarize(url)
    display(Markdown(summary))`,
            after: `
**Tại sao đổi model từ \`gpt-5-nano\` (bước 3) sang \`gpt-4.1-mini\`?**

- \`gpt-5-nano\`: nhỏ nhất, rẻ nhất, đủ cho task đơn giản (hello world)
- \`gpt-4.1-mini\`: sweet spot cho task có chút độ phức tạp (đọc website, viết summary có tone) — quality cao hơn rõ rệt, vẫn rẻ

Quy tắc thực tế: **bắt đầu với model rẻ nhất, escalate khi cần**. Không có lý do gì dùng GPT-5 full cho task tóm tắt 1 trang web — overkill, đắt 10× mà quality không khác biệt nhiều.

\`display(Markdown(...))\` là helper của IPython/Jupyter — render Markdown thành HTML đẹp trong notebook cell. Trong production sẽ thay bằng render frontend (Gradio, React).
`
        },
        {
            title: "Bước 8 — Test pipeline trên các website thật",
            lang: "python",
            before: `
**Chạy thử trên nhiều website khác nhau** để verify pipeline robust. Mỗi site có structure khác → một bài test stress khá tốt cho scraper + LLM.
`,
            code: `display_summary("https://edwarddonner.com")
display_summary("https://cnn.com")
display_summary("https://anthropic.com")`,
            after: `
**Quan sát quan trọng:**

- Cùng pipeline, cùng prompt → output có tone "snarky" cho mọi site (system prompt quyết định)
- Output là Markdown structured: heading, bullet, link. LLM tự decide structure phù hợp với content
- Một số site (vd \`openai.com\`) không hoạt động vì JavaScript rendering — scraper đơn giản không xử lý được. Đây là expected limitation, fix sau bằng Playwright

**Business value:** pattern *scrape → LLM summarize → display* áp dụng được cho hàng trăm use case — news digest, competitor monitoring, document review, support ticket triage… Day 1 đã có sản phẩm production-ready foundation.
`
        }
    ]
});
