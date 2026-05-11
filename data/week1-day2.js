window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 1,
    day: 2,
    title: "Frontier Labs · OpenAI-compatible chuẩn de-facto · 1 client cho mọi provider",
    notebooks: ["week1/day2.ipynb"],
    topics: [
        "6 Frontier Labs lớn và mô hình của họ",
        "Chat Completions API là gì — và vì sao trở thành chuẩn ngành",
        "Gọi raw HTTP với requests vs OpenAI Python client",
        "OpenAI-compatible endpoint: dùng cùng 1 client cho Gemini, DeepSeek, Ollama…",
        "OpenRouter — gateway hợp nhất hàng trăm model",
        "Chạy LLaMA local qua Ollama nhưng dùng OpenAI client",
        "Bài tập: rewrite Website Summarizer dùng Ollama (miễn phí)"
    ],
    summary: `
## 1. Frontier Labs — landscape

Trước khi viết code, biết "ai là ai" trong thế giới LLM:

| Lab | Model | Đặc điểm |
|---|---|---|
| OpenAI | GPT-5, o-series | Pioneer, ecosystem mạnh nhất |
| Anthropic | Claude 4.5 (Opus/Sonnet/Haiku) | An toàn, code & writing xuất sắc |
| Google DeepMind | Gemini 2.5 Pro/Flash | Context 1M+, multimodal native |
| xAI | Grok 4 | Tích hợp X (Twitter), real-time data |
| Meta AI | LLaMA 3.x, 4 | Open-weight hàng đầu |
| DeepSeek | V3, R1 | Trung Quốc, open-weight, rẻ |

Cộng thêm Mistral (Pháp), Cohere (Canada), Microsoft (Phi), Alibaba (Qwen), Groq (chỉ làm chip inference, không train model).

## 2. Chat Completions API — chuẩn de-facto

OpenAI nghĩ ra format \`messages: [{role, content}]\` cho Chat Completions. Format đủ đơn giản và đủ tốt → các provider khác (Google, DeepSeek, Groq, xAI, Ollama, OpenRouter) đều cung cấp **OpenAI-compatible endpoint**: cùng URL pattern, cùng request/response shape, chỉ khác \`base_url\`.

**Hệ quả thực tế:** developer chỉ cần học **một** API và một thư viện client (\`openai\` Python lib), đổi \`base_url\` + \`api_key\` là gọi được ~95% model trên thị trường.

Anthropic là ngoại lệ — có Messages API riêng, nhưng vẫn có compat layer.

## 3. Hiểu nhầm phổ biến

"OpenAI Python library chứa GPT model" — **SAI**. Library chỉ làm 4 việc:
1. Build JSON request từ Python args
2. Set HTTP header \`Authorization: Bearer <key>\`
3. POST tới endpoint cloud
4. Parse JSON response thành Pydantic object

Bạn có thể bỏ hoàn toàn library và dùng \`requests\` raw — kết quả y hệt. Day 2 sẽ chứng minh điều này ở Bước 1.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model:** Coi LLM provider như cloud database. Bạn không quan tâm Postgres chạy ở đâu — bạn dùng SQL chuẩn. Tương tự, Chat Completions là 'SQL của LLM'. Code business logic độc lập với provider."
        },
        {
            type: "warn",
            text: "**Đừng abstract sớm.** Nhiều người mới học vội ôm LangChain ngay. Hãy gọi raw API trước cho hiểu cơ chế. Abstraction quá sớm = debug khó gấp đôi."
        }
    ],
    keyPoints: [
        "**Cùng 1 client, mọi provider** — pattern \`OpenAI(base_url=..., api_key=...)\` là 'siêu năng lực' cho developer. Code business logic độc lập với provider.",
        "**OpenAI library chỉ là HTTP wrapper.** Không có magic. Hiểu được điều này → debug rất dễ.",
        "**Gemini compatible endpoint:** \`https://generativelanguage.googleapis.com/v1beta/openai/\` với key \`AIz...\`",
        "**Ollama compatible endpoint:** \`http://localhost:11434/v1\` với \`api_key='ollama'\` (giá trị giả, client yêu cầu phải có).",
        "**Máy yếu?** \`llama3.2:1b\` (1.3GB) thay \`llama3.2\` (~2GB). Tránh \`llama3.3\`/\`llama4\` — quá lớn cho máy cá nhân.",
        "**Model naming thay đổi liên tục.** Đặt model làm constant (\`MODEL = \"gpt-4.1-mini\"\`), đừng hardcode rải rác."
    ],
    code: [
        {
            title: "Bước 1 — Validate API keys cho nhiều provider",
            lang: "python",
            before: `
**Setup nhiều provider cùng lúc.** Trong \`.env\` có thể có:

\`\`\`
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIz...
DEEPSEEK_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GROK_API_KEY=xai-...
OPENROUTER_API_KEY=sk-or-...
\`\`\`

Pattern phổ biến: validate sự tồn tại của các key ngay đầu notebook để khỏi gặp error lạ giữa chừng.
`,
            code: `import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)
openai_api_key = os.getenv('OPENAI_API_KEY')
anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')
google_api_key = os.getenv('GOOGLE_API_KEY')
deepseek_api_key = os.getenv('DEEPSEEK_API_KEY')
groq_api_key = os.getenv('GROQ_API_KEY')
grok_api_key = os.getenv('GROK_API_KEY')
openrouter_api_key = os.getenv('OPENROUTER_API_KEY')

if openai_api_key:
    print(f"OpenAI API Key exists and begins {openai_api_key[:8]}")
else:
    print("OpenAI API Key not set")

if anthropic_api_key:
    print(f"Anthropic API Key exists and begins {anthropic_api_key[:7]}")
else:
    print("Anthropic API Key not set (and this is optional)")

# ... tương tự cho các provider khác`,
            after: `
**Lưu ý format đặc thù:**

- OpenAI: \`sk-proj-...\` (project-scoped) hoặc \`sk-...\` (legacy)
- Anthropic: \`sk-ant-...\`
- Google AI Studio: \`AIz...\` (39 ký tự)
- DeepSeek: \`sk-...\` (giống OpenAI legacy — confuse được)
- Groq: \`gsk_...\`
- xAI Grok: \`xai-...\`
- OpenRouter: \`sk-or-v1-...\`

In ra \`[:N]\` chứ không in cả key → tránh leak nếu vô tình share screen.
`
        },
        {
            title: "Bước 2 — Gọi raw HTTP để hiểu API thực sự là gì",
            lang: "python",
            before: `
**Hiểu nhầm cần phá vỡ:** "OpenAI Python library chứa AI model". Sai. Library chỉ là HTTP wrapper. Để chứng minh, gọi raw bằng \`requests\` — kết quả y hệt như dùng client.

Trong notebook bước này dạy "the boring way" trước, để khi sau đó dùng client thấy nó "elegant" như thế nào.
`,
            code: `import requests

headers = {"Authorization": f"Bearer {openai_api_key}", "Content-Type": "application/json"}

payload = {
    "model": "gpt-5-nano",
    "messages": [
        {"role": "user", "content": "Tell me a fun fact"}
    ]
}

response = requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers=headers,
    json=payload
)

response.json()`,
            after: `
**Mổ xẻ:**

- **Endpoint:** \`https://api.openai.com/v1/chat/completions\`. Tất cả request đến đây.
- **Header \`Authorization: Bearer <key>\`**: chuẩn HTTP để xác thực. \`Bearer\` là token-based auth.
- **Body:** JSON với 2 field bắt buộc — \`model\` và \`messages\`. Có thể thêm optional \`temperature\`, \`max_tokens\`, \`stream\`, v.v.
- **Response:** JSON với \`choices[0].message.content\` chứa output.

\`response.json()\` trả về dict đầy đủ — có cả \`id\`, \`created\`, \`usage.prompt_tokens\`, \`usage.completion_tokens\` (rất hữu ích cho cost tracking).

Extract content text:

\`\`\`python
response.json()["choices"][0]["message"]["content"]
\`\`\`

**Kết luận:** không có gì magic. Library chỉ tạo cú pháp Python đẹp hơn JSON dict.
`
        },
        {
            title: "Bước 3 — Cùng thứ với OpenAI client (elegant version)",
            lang: "python",
            before: `
Giờ làm lại bước 2 với client. So sánh hai cách → thấy ngay client lợi ở chỗ nào.
`,
            code: `# Create OpenAI client

from openai import OpenAI
openai = OpenAI()

response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=[{"role": "user", "content": "Tell me a fun fact"}]
)

response.choices[0].message.content`,
            after: `
**Khác biệt vs raw HTTP:**

1. Không phải tự build JSON, tự set header
2. Không phải parse \`response.json()\` → access bằng dot notation thay vì bracket
3. Response là **Pydantic object** → IDE auto-complete được (\`response.choices[0].message.\` rồi tab → thấy tất cả field)
4. \`OpenAI()\` không truyền key — tự đọc \`OPENAI_API_KEY\` từ env

**Đằng sau:** \`openai.chat.completions.create()\` literally chỉ là raw HTTP call ở bước 2, được Python wrap lại. Bạn có thể đọc source code của library — chỉ ~vài chục dòng cho hàm này.
`
        },
        {
            title: "Bước 4 — 'Siêu năng lực': 1 client cho Gemini",
            lang: "python",
            before: `
**OpenAI-compatible endpoints** — đây là khái niệm thay đổi tất cả.

Vì Chat Completions API phổ biến, các provider khác (Google, DeepSeek, Groq…) đều build endpoint *tương thích* — cùng URL pattern \`/chat/completions\`, cùng request/response format. Kết quả: cùng \`OpenAI()\` client gọi được mọi provider, **chỉ đổi base_url**.

Gemini endpoint: \`https://generativelanguage.googleapis.com/v1beta/openai/\`
`,
            code: `GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

google_api_key = os.getenv("GOOGLE_API_KEY")

gemini = OpenAI(base_url=GEMINI_BASE_URL, api_key=google_api_key)

response = gemini.chat.completions.create(
    model="gemini-2.5-flash-lite",
    messages=[{"role": "user", "content": "Tell me a fun fact"}]
)

response.choices[0].message.content`,
            after: `
**Đọc kỹ:** \`gemini = OpenAI(...)\`. Mặc dù tên class là "OpenAI", **không có** model OpenAI nào involved. Client chỉ là HTTP wrapper, không quan tâm endpoint thuộc về ai. Tên class hơi confuse nhưng đã là convention chuẩn.

**Hệ quả thực tế cho production:**

\`\`\`python
# Code business logic — không cần biết provider nào
def generate(client, prompt, model):
    resp = client.chat.completions.create(model=model, messages=[...])
    return resp.choices[0].message.content

# Swap provider chỉ ở chỗ tạo client
client = OpenAI()  # OpenAI
# client = OpenAI(base_url="...", api_key="...")  # Gemini
# client = OpenAI(base_url="...", api_key="...")  # Anthropic via compat
\`\`\`

**Function \`generate()\` không sửa 1 dòng** khi đổi provider.
`
        },
        {
            title: "Bước 5 — Ollama như OpenAI-compatible local server",
            lang: "python",
            before: `
**Ollama miễn phí + cùng API.** Sau khi cài Ollama (Day 1), nó tự start một server local ở \`http://localhost:11434\`. Server này expose OpenAI-compatible endpoint tại \`/v1\`.

Trước khi chạy, verify Ollama đang sống:
`,
            code: `# Test Ollama đang chạy
requests.get("http://localhost:11434").content
# Output: b'Ollama is running'

# Nếu không, mở terminal và chạy: ollama serve

# Pull model nếu chưa có
!ollama pull llama3.2

# Connect bằng OpenAI client
OLLAMA_BASE_URL = "http://localhost:11434/v1"
ollama = OpenAI(base_url=OLLAMA_BASE_URL, api_key='ollama')

response = ollama.chat.completions.create(
    model="llama3.2",
    messages=[{"role": "user", "content": "Tell me a fun fact"}]
)

response.choices[0].message.content`,
            after: `
**Diễn giải:**

- \`api_key='ollama'\` — giá trị giả. Ollama không thực sự xác thực, nhưng \`OpenAI()\` client yêu cầu non-empty string. Có thể truyền bất cứ string nào.
- \`model="llama3.2"\` — tên model trong Ollama registry (không phải HuggingFace name). Liệt kê model đã pull: \`ollama list\`.
- \`!ollama pull llama3.2\` — magic syntax của Jupyter cho shell command. Trong Python script thuần dùng \`subprocess.run(["ollama", "pull", "llama3.2"])\`.

**Ý nghĩa lớn:** code business logic ở trên giống hệt khi gọi GPT/Gemini. Có thể **swap GPT ↔ LLaMA chỉ bằng 1 dòng config**. Đây là cách build app có "free tier" cho user — dùng Ollama; user trả phí → upgrade lên GPT.
`
        },
        {
            title: "Bước 6 — Reasoning model với DeepSeek R1 distilled",
            lang: "python",
            before: `
**Reasoning model = model train để "think step by step".** DeepSeek R1 là reasoning model open-weight nổi tiếng. "Distilled" nghĩa là kiến thức của R1 lớn (671B) được "ép" vào model nhỏ hơn (1.5B, 7B, 8B…) — Tuần 7 sẽ học sâu kỹ thuật này.

R1 distilled vào Qwen 1.5B chỉ nặng ~1GB → chạy được cả máy yếu.
`,
            code: `# DeepSeek R1 "distilled" into Qwen 1.5B from Alibaba Cloud
!ollama pull deepseek-r1:1.5b

response = ollama.chat.completions.create(
    model="deepseek-r1:1.5b",
    messages=[{"role": "user", "content": "Tell me a fun fact"}]
)

response.choices[0].message.content`,
            after: `
**Output đặc biệt của reasoning model:**

\`\`\`
<think>
Okay, the user wants a fun fact. Let me think of something
interesting and not too well-known...
</think>

Did you know octopuses have three hearts?
\`\`\`

Reasoning model có **thinking phase** trong tag \`<think>...</think>\` trước câu trả lời chính thức. Đây là chain-of-thought *explicit*. Có thể strip tag này khi hiển thị cho user, nhưng giữ lại khi debug.

**Trade-off:**
- Reasoning model: tốt cho math, code, logic phức tạp. Chậm hơn (cần sinh thinking tokens) → đắt hơn.
- Chat model thường: nhanh, đủ cho hầu hết task (summarize, write, chat).

Quy tắc: **default chat model**, escalate lên reasoning model khi task có nhiều bước logic.
`
        },
        {
            title: "Bước 7 — Native SDK của Gemini và Anthropic",
            lang: "python",
            before: `
**Khi nào dùng native SDK thay vì OpenAI-compatible?**

Mặc dù 95% case dùng compat layer là đủ, các SDK native có thể expose feature đặc thù mà compat layer chưa support. Ví dụ Anthropic prompt caching pattern, hay Gemini multimodal native.

Day 2 demo nhanh native SDK để bạn biết option khi cần.
`,
            code: `# Gemini native SDK
from google import genai

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash-lite",
    contents="Describe the color Blue to someone who's never been able to see in 1 sentence"
)
print(response.text)


# Anthropic native SDK
from anthropic import Anthropic

client = Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    messages=[{"role": "user", "content": "Describe the color Blue to someone who's never been able to see in 1 sentence"}],
    max_tokens=100
)
print(response.content[0].text)`,
            after: `
**Khác biệt API native:**

- **Gemini**: dùng \`generate_content\` thay \`chat.completions.create\`. Field tên là \`contents\` không phải \`messages\`. Trả về \`response.text\` thay \`response.choices[0].message.content\`.
- **Anthropic**: tên endpoint là \`messages\` (singular service, không phải "chat completions"). Bắt buộc \`max_tokens\` (OpenAI optional). Response là \`response.content[0].text\` — không có nested choices.

**Khuyên dùng:**

- Prototype, dự án nhỏ → OpenAI client cho mọi provider (1 mental model)
- Production cần feature đặc thù (Anthropic prompt caching, Gemini files API, OpenAI assistants) → native SDK của provider đó

**Đừng học hết SDK mọi provider từ đầu** — sa lầy. Học OpenAI client cho thuộc, khi gặp use case cần native mới đọc docs.
`
        },
        {
            title: "Bước 8 — OpenRouter: 1 key cho hàng trăm model",
            lang: "python",
            before: `
**OpenRouter** là "API gateway" — 1 endpoint, 1 key, route tới 400+ model trên thị trường (OpenAI, Anthropic, Google, Meta, DeepSeek, Mistral…).

Giá trị:
- Test nhanh nhiều model mà không phải tạo account ở 7 nơi
- Auto fallback khi provider down
- Single bill consolidate

Trade-off: cost markup ~5-10%, thêm 1 hop latency.
`,
            code: `OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

openrouter = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=openrouter_api_key
)

# Try GLM 4.5 from Chinese startup z.ai — model chưa thấy ở provider khác
response = openrouter.chat.completions.create(
    model="z-ai/glm-4.5",
    messages=[{"role": "user", "content": "Tell a joke for a student on the journey to becoming an expert in LLM Engineering"}]
)

response.choices[0].message.content`,
            after: `
**Pattern model name của OpenRouter:** \`<provider>/<model>\`. Vài ví dụ:
- \`openai/gpt-5\`
- \`anthropic/claude-sonnet-4-5\`
- \`google/gemini-2.5-pro\`
- \`meta-llama/llama-3.3-70b\`
- \`z-ai/glm-4.5\`

Browse model + giá tại [openrouter.ai/models](https://openrouter.ai/models).

**Khi nào dùng OpenRouter:**

✅ Test nhiều model nhanh trong notebook
✅ Side project không muốn maintain 5 API keys
✅ Production cần redundancy / fallback

❌ Production scale lớn (markup trở thành chi phí đáng kể)
❌ Cần feature đặc thù chỉ có ở native SDK (caching, batch API)
❌ Data nhạy cảm — thêm 1 lớp third-party
`
        }
    ]
});
