window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 2,
    day: 1,
    title: "Frontier model showdown · Reasoning effort · Prompt caching · LLM-vs-LLM conversation",
    notebooks: ["week2/day1.ipynb"],
    topics: [
        "Test 6 frontier model trên cùng câu đố để cảm nhận khác biệt",
        "Reasoning effort — ngân sách 'nghĩ' của reasoning model",
        "Train-time vs Inference-time scaling — bài học từ thực nghiệm",
        "Prompt caching — 3 provider implement khác nhau",
        "Multi-turn conversation — biểu diễn lịch sử hội thoại",
        "LLM-vs-LLM: 2 model 'đối thoại' với nhau qua role-swap"
    ],
    summary: `
## 1. Cốt lõi Tuần 2

Tuần 2 mở rộng từ "gọi 1 LLM" sang "gọi nhiều LLM", "build UI", "thêm tool", "agentic loop", "multi-modal". Day 1 chuẩn bị nền: kết nối nhiều provider, hiểu reasoning effort, prompt caching, và pattern "LLM-vs-LLM".

## 2. Khái niệm mới: Reasoning Effort

Với reasoning model (GPT-5, Claude thinking, Gemini thinking), provider expose tham số \`reasoning_effort\`:

| Effort | Token nội suy | Cost | Latency | Khi nào dùng |
|---|---|---|---|---|
| minimal | vài trăm | 1× | ~1s | Task giống chat thường |
| low | vài nghìn | 2× | ~3s | Có chút logic |
| medium | 10–20K | 5× | 10s | Default cho task khó |
| high | 50K+ | 10–20× | 30s+ | Toán Olympics, code phức tạp |

## 3. Hai trục scaling

Day 1 thực nghiệm cùng câu đố (sách Pushkin) với:
- GPT-5-nano + reasoning low → trả lời nhanh, sai
- GPT-5-nano + reasoning high → trả lời chậm hơn, đúng
- GPT-5 (model lớn hơn) + reasoning default → đúng nhanh

→ Minh chứng cho 2 trục scaling **tách biệt**:
- **Train-time**: model lớn hơn → biết nhiều hơn intrinsically
- **Inference-time**: cùng model, "nghĩ" lâu hơn → reasoning tốt hơn

Provider hiện đại tối ưu cả hai. User chỉ thấy "GPT-5" nhưng bên trong là router quyết định model size + reasoning effort.

## 4. Prompt Caching — tiết kiệm khi prompt prefix lặp lại

Khi prompt có một *prefix* không đổi giữa các request (vd system prompt 5K token, hay nguyên cuốn Hamlet làm context), provider có thể cache KV-attention đã tính cho prefix đó:

| Provider | Cơ chế | Đặc điểm |
|---|---|---|
| **OpenAI** | Tự động (implicit) | Match prefix exact, TTL ~5–10 phút, cached input rẻ 50–75% |
| **Anthropic** | Manual (explicit) | Gắn \`cache_control\` lên message. Trả thêm 25% prime cache, sau đó cached rẻ 90% |
| **Gemini** | Cả implicit + explicit | API riêng |

Quy tắc thiết kế prompt cho cache hit:
1. Phần **tĩnh** (system prompt, examples, document context) ở **đầu**
2. Phần **động** (user query) ở **cuối**
3. Tránh thêm timestamp / random ID vào phần tĩnh
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho prompt caching:** Coi prefix tĩnh như một 'compiled artifact'. Lần đầu provider 'compile' (full price), sau đó 'load from cache' nhiều lần (rất rẻ). Thiết kế prompt như viết function: phần invariant ra ngoài, phần variant đi vào parameter."
        },
        {
            type: "warn",
            text: "**Reasoning token đếm vào output token quota.** Một câu trả lời 100 tokens nhưng reasoning 20K tokens → bạn trả tiền cho 20.1K output tokens. Set \`max_completion_tokens\` chặt khi cần kiểm soát chi phí."
        }
    ],
    keyPoints: [
        "**Reasoning effort là tradeoff cost-accuracy.** Default medium thường ổn cho ~80% task. Chỉ tăng lên high khi medium thực sự sai.",
        "**Prompt caching tiết kiệm không bằng nhau giữa các provider.** OpenAI (implicit, free) là dễ nhất. Anthropic explicit có discount lớn nhất nhưng overhead 25%.",
        "**Cache hit cần prefix match chính xác (byte-level).** Một space khác, một dấu phẩy thừa → cache miss. Khi build prompt template, để phần tĩnh hoàn toàn deterministic.",
        "**Vi phạm alternating user/assistant** thường gây error 400. Nếu cần ghép 2 message cùng role, ghép vào content thay vì 2 message riêng.",
        "**Multi-LLM conversation = perspective swap.** Cùng một text 'Hi there', với GPT là assistant message, với Claude lại là user message. Model nào đang gọi → vai trò 'assistant' luôn thuộc về model đó."
    ],
    code: [
        {
            title: "Bước 1 — Setup 7 client cho mọi provider",
            lang: "python",
            before: `
**Standard setup Tuần 2:** kết nối với nhiều provider cùng lúc. Pattern này dùng xuyên suốt — học một lần, áp dụng cho mọi notebook sau.
`,
            code: `import os
import requests
from dotenv import load_dotenv
from openai import OpenAI
from IPython.display import Markdown, display

load_dotenv(override=True)

# Connect to OpenAI client library — wrapper mỏng quanh HTTP
openai = OpenAI()

# Các URL OpenAI-compatible
anthropic_url   = "https://api.anthropic.com/v1/"
gemini_url      = "https://generativelanguage.googleapis.com/v1beta/openai/"
deepseek_url    = "https://api.deepseek.com"
groq_url        = "https://api.groq.com/openai/v1"
grok_url        = "https://api.x.ai/v1"
openrouter_url  = "https://openrouter.ai/api/v1"
ollama_url      = "http://localhost:11434/v1"

# Mỗi provider = 1 OpenAI client với base_url + key khác
anthropic   = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY"),   base_url=anthropic_url)
gemini      = OpenAI(api_key=os.getenv("GOOGLE_API_KEY"),      base_url=gemini_url)
deepseek    = OpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"),    base_url=deepseek_url)
groq        = OpenAI(api_key=os.getenv("GROQ_API_KEY"),        base_url=groq_url)
grok        = OpenAI(api_key=os.getenv("GROK_API_KEY"),        base_url=grok_url)
openrouter  = OpenAI(api_key=os.getenv("OPENROUTER_API_KEY"),  base_url=openrouter_url)
ollama      = OpenAI(api_key="ollama",                          base_url=ollama_url)`,
            after: `
**7 clients, 1 mental model.** Mọi client đều là \`OpenAI(...)\` — bạn gọi \`client.chat.completions.create()\` giống hệt nhau. Đây là sức mạnh của OpenAI-compatible standard (Day 2 Tuần 1 đã giải thích).

**Groq là gì?** Không phải LLM provider — họ làm **chip inference** (LPU - Language Processing Unit). Cung cấp open-source model (Llama, Mistral, Qwen…) qua API với latency cực thấp (~5× nhanh hơn GPU). Dùng cùng cách như OpenAI client.

**xAI Grok** ≠ Groq. Grok là LLM của Elon Musk, Groq là chip company. Tên trùng cố ý gây tranh chấp.
`
        },
        {
            title: "Bước 2 — So sánh 4 frontier model trên câu chuyện cười",
            lang: "python",
            before: `
**Quick eval pattern:** đặt cùng câu hỏi tới nhiều model → so sánh output. Đây là cách nhanh nhất feel khác biệt về tone, style, length.
`,
            code: `tell_a_joke = [
    {"role": "user", "content":
        "Tell a joke for a student on the journey to becoming an expert in LLM Engineering"}
]

# OpenAI
response = openai.chat.completions.create(model="gpt-4.1-mini", messages=tell_a_joke)
display(Markdown(response.choices[0].message.content))

# Anthropic
response = anthropic.chat.completions.create(model="claude-sonnet-4-5-20250929", messages=tell_a_joke)
display(Markdown(response.choices[0].message.content))

# Gemini
response = gemini.chat.completions.create(model="gemini-2.5-flash-lite", messages=tell_a_joke)
display(Markdown(response.choices[0].message.content))

# Grok
response = grok.chat.completions.create(model="grok-4", messages=tell_a_joke)
display(Markdown(response.choices[0].message.content))`,
            after: `
**Quan sát điển hình:**

- **GPT** thường ngắn, punchy, có cấu trúc setup-punchline rõ ràng
- **Claude** dài hơn, hay thêm bối cảnh và emoji
- **Gemini** trung dung, ít memorable
- **Grok** thiên về sarcasm, edgy hơn (đúng "personality" Elon set)

**Pattern này áp dụng cho mọi quyết định chọn model:** đừng tin marketing, **eval trên use case của bạn**. Một model top MMLU có thể tệ ở tone bạn cần. Một model rẻ có thể đủ.

**Lưu ý kỹ thuật:** notebook trên dùng Anthropic qua OpenAI-compatible. Cho một số feature Anthropic-specific (prompt caching aggressive, multi-modal vision), cần dùng native \`anthropic\` SDK.
`
        },
        {
            title: "Bước 3 — Reasoning effort: cùng model, khác accuracy",
            lang: "python",
            before: `
**Câu đố probability cổ điển.** Có 2 đồng xu, một cái sấp. Xác suất cái còn lại ngửa là bao nhiêu?

Đáp án đúng là **2/3** (conditional probability — biết có ít nhất 1 sấp → loại trừ trường hợp NN, còn SS, SN, NS → 2/3 trường hợp có 1 ngửa). Nhiều người (và LLM) mò vội ra 1/2.

Thử model nhỏ với reasoning effort khác nhau:
`,
            code: `easy_puzzle = [
    {"role": "user", "content":
        "You toss 2 coins. One of them is heads. What's the probability the other is tails? "
        "Answer with the probability only."}
]

# Minimal — gần như không reasoning
response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=easy_puzzle,
    reasoning_effort="minimal"
)
display(Markdown(response.choices[0].message.content))

# Low — có chút thinking
response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=easy_puzzle,
    reasoning_effort="low"
)
display(Markdown(response.choices[0].message.content))

# Model lớn hơn (gpt-5-mini) với minimal effort
response = openai.chat.completions.create(
    model="gpt-5-mini",
    messages=easy_puzzle,
    reasoning_effort="minimal"
)
display(Markdown(response.choices[0].message.content))`,
            after: `
**Kết quả thực nghiệm:**
- \`gpt-5-nano\` + \`minimal\`: thường đáp **1/2** (sai)
- \`gpt-5-nano\` + \`low\`: đáp **2/3** (đúng) — dành thời gian nghĩ
- \`gpt-5-mini\` + \`minimal\`: đáp **2/3** (đúng) — model lớn hơn nên không cần nghĩ nhiều

**Bài học 2 trục scaling:**

| | nano (small) | mini (big) |
|---|---|---|
| **minimal effort** | sai | đúng |
| **low effort** | đúng | đúng |

Model nhỏ + nghĩ kỹ ≈ model lớn + nghĩ ít, về accuracy. Nhưng **cost** rất khác: small + high effort thường rẻ hơn big + medium effort. Khi tối ưu, tune cả hai trục.
`
        },
        {
            title: "Bước 4 — Câu đố KHÓ: hai model nhỏ KHÔNG đủ",
            lang: "python",
            before: `
**Worm puzzle nổi tiếng:** 2 cuốn Pushkin đứng cạnh nhau, mỗi cuốn dày 2cm trang + 2 bìa 2mm. Sâu khoét từ trang 1 của tập 1 đến trang cuối của tập 2 (vuông góc trang). Quãng đường?

**Trap:** đa số người (và model) tính cộng tất cả → ~4.8cm. Nhưng đáp đúng là **0.4cm** — vì khi 2 cuốn đứng cạnh nhau trên kệ, trang 1 của tập 1 và trang cuối của tập 2 chỉ cách nhau qua 2 bìa.
`,
            code: `hard = """
On a bookshelf, two volumes of Pushkin stand side by side: the first and the second.
The pages of each volume together have a thickness of 2 cm, and each cover is 2 mm thick.
A worm gnawed (perpendicular to the pages) from the first page of the first volume to the last page of the second volume.
What distance did it gnaw through?
"""
hard_puzzle = [{"role": "user", "content": hard}]

# Model nhỏ + effort thấp — fail
response = openai.chat.completions.create(model="gpt-5-nano", messages=hard_puzzle, reasoning_effort="minimal")
display(Markdown(response.choices[0].message.content))

# Claude — thử model khác
response = anthropic.chat.completions.create(model="claude-sonnet-4-5-20250929", messages=hard_puzzle)
display(Markdown(response.choices[0].message.content))

# Model lớn nhất + default effort
response = openai.chat.completions.create(model="gpt-5", messages=hard_puzzle)
display(Markdown(response.choices[0].message.content))

# Gemini 2.5 Pro
response = gemini.chat.completions.create(model="gemini-2.5-pro", messages=hard_puzzle)
display(Markdown(response.choices[0].message.content))`,
            after: `
**Kết quả thực nghiệm điển hình:**
- \`gpt-5-nano\` minimal: **sai** (cộng tất cả)
- \`claude-sonnet-4-5\`: thường **đúng**, có solution đẹp
- \`gpt-5\` default reasoning: **đúng**
- \`gemini-2.5-pro\`: thường **đúng**

**Quan sát:** câu đố này không thực sự khó — chỉ là *tricky* — đòi hỏi visual reasoning về cách sách đứng trên kệ. Model nhỏ thiếu visualization, model lớn có.

**Lesson:** không có model "đúng cho mọi câu". Một số task model nhỏ + reasoning đủ. Một số task cần model lớn intrinsic. Đo trên task của bạn để biết.
`
        },
        {
            title: "Bước 5 — Prompt caching minh họa với Hamlet",
            lang: "python",
            before: `
**Demo prompt caching.** Hamlet text dài (~150K ký tự). Hỏi câu nhanh về nó → trả tiền full input first time, rồi cached cho query sau.

Dùng LiteLLM vì nó expose \`response.usage.prompt_tokens_details.cached_tokens\` dễ đọc.
`,
            code: `from litellm import completion

with open("hamlet.txt", "r", encoding="utf-8") as f:
    hamlet = f.read()

# Hỏi câu đầu tiên — KHÔNG có Hamlet trong prompt
question = [{"role": "user", "content": "In Hamlet, when Laertes asks 'Where is my father?' what is the reply?"}]
response = completion(model="gemini/gemini-2.5-flash-lite", messages=question)

print(f"Input tokens: {response.usage.prompt_tokens}")
print(f"Output tokens: {response.usage.completion_tokens}")
# Model có thể trả từ memory training data, hoặc nói không biết

# Bây giờ thêm Hamlet vào prompt để chắc chắn
question[0]["content"] += "\\n\\nFor context, here is the entire text of Hamlet:\\n\\n" + hamlet

# Call lần 1 — full price
response = completion(model="gemini/gemini-2.5-flash-lite", messages=question)
print(f"Input tokens: {response.usage.prompt_tokens}")           # ~50K
print(f"Cached tokens: {response.usage.prompt_tokens_details.cached_tokens}")  # 0

# Call lần 2 — CÙNG prompt, cached
response = completion(model="gemini/gemini-2.5-flash-lite", messages=question)
print(f"Input tokens: {response.usage.prompt_tokens}")           # ~50K
print(f"Cached tokens: {response.usage.prompt_tokens_details.cached_tokens}")  # ~49K, gần full`,
            after: `
**Output mẫu:**

\`\`\`
Lần 1:
  Input tokens: 49823
  Cached tokens: 0
  Cost: $0.0050

Lần 2:
  Input tokens: 49823
  Cached tokens: 49500     ← gần như cả prompt từ cache
  Cost: $0.0008            ← rẻ hơn 6×
\`\`\`

**Diễn giải:**

- **Lần 1**: provider chưa thấy prompt này → phải tính KV-attention từ đầu → full price
- **Lần 2**: prompt giống hệt → provider nhận diện được, dùng KV-cache đã lưu → rẻ hơn nhiều

**Trick để cache hit:**
- Phần tĩnh (system, context) **luôn ở đầu**
- Phần động (query) **ở cuối**
- KHÔNG thêm timestamp / random ID vào phần tĩnh
- KHÔNG đổi format / spacing

OpenAI và Anthropic có pattern giống — chỉ khác cơ chế (implicit vs explicit) và discount %.
`
        },
        {
            title: "Bước 6 — Multi-turn conversation: cấu trúc messages",
            lang: "python",
            before: `
**Pattern conversation history.** Trước khi build chatbot UI ở Day 2-3, hiểu cấu trúc messages cho multi-turn.

Quy tắc: messages **alternating** user/assistant (sau system). Sai → API 400.
`,
            code: `# Conversation 3 turn
messages = [
    {"role": "system",    "content": "You are a helpful tutor"},
    {"role": "user",      "content": "What is recursion?"},
    {"role": "assistant", "content": "Recursion is when a function calls itself..."},
    {"role": "user",      "content": "Can you give an example?"},
    {"role": "assistant", "content": "Sure! Factorial: def fact(n): return 1 if n<=1 else n*fact(n-1)"},
    {"role": "user",      "content": "What's the time complexity?"},   # turn hiện tại
]

response = openai.chat.completions.create(model="gpt-4.1-mini", messages=messages)
print(response.choices[0].message.content)`,
            after: `
**Quan sát:**

- **System**: 1 lần ở đầu — định nghĩa vai trò
- **User/assistant alternating**: 2 turn cũ (Q1+A1, Q2+A2) + Q3 hiện tại
- Model trả lời Q3 với **đầy đủ context** của 2 turn trước

**Pitfall thường gặp:**

\`\`\`python
# SAI - 2 user messages liên tiếp
messages = [
    {"role": "user", "content": "Hello"},
    {"role": "user", "content": "How are you?"},  # ← Error 400
]

# ĐÚNG - merge thành 1 user message
messages = [
    {"role": "user", "content": "Hello. How are you?"},
]
\`\`\`

**Cost:** mỗi turn, bạn trả tiền cho **toàn bộ history**. Cuộc trò chuyện càng dài → cost mỗi turn càng tăng tuyến tính.
`
        },
        {
            title: "Bước 7 — LLM-vs-LLM: hai model 'đối thoại' qua role-swap",
            lang: "python",
            before: `
**Pattern multi-agent ở dạng đơn giản nhất.** Hai model với personality khác nhau "trò chuyện" với nhau.

**Trick role-swap:** khi gọi GPT, GPT là 'assistant' và Claude là 'user'. Khi gọi Claude, ngược lại — Claude là 'assistant' và GPT là 'user'. Cùng dữ liệu, role được gán khác nhau tùy đang gọi model nào.
`,
            code: `gpt_model = "gpt-4.1-mini"
claude_model = "claude-haiku-4-5"

gpt_system = "You are a chatbot who is very argumentative; \\
you disagree with anything in the conversation and challenge everything in a snarky way."

claude_system = "You are a very polite, courteous chatbot. You try to agree with \\
everything the other person says, or find common ground. If the other person is argumentative, \\
you try to calm them down."

gpt_messages = ["Hi there"]
claude_messages = ["Hi"]

def call_gpt():
    messages = [{"role": "system", "content": gpt_system}]
    # Lượt cũ: GPT là assistant, Claude là user (từ góc nhìn GPT)
    for gpt, claude in zip(gpt_messages, claude_messages):
        messages.append({"role": "assistant", "content": gpt})
        messages.append({"role": "user",      "content": claude})
    response = openai.chat.completions.create(model=gpt_model, messages=messages)
    return response.choices[0].message.content

def call_claude():
    messages = [{"role": "system", "content": claude_system}]
    # Lượt cũ: Claude là assistant, GPT là user (từ góc nhìn Claude)
    for gpt, claude_message in zip(gpt_messages, claude_messages):
        messages.append({"role": "user",      "content": gpt})
        messages.append({"role": "assistant", "content": claude_message})
    messages.append({"role": "user", "content": gpt_messages[-1]})
    response = anthropic.chat.completions.create(model=claude_model, messages=messages)
    return response.choices[0].message.content`,
            after: `
**Đọc kỹ 2 function — đây là khái niệm dễ nhầm nhất:**

Trong \`call_gpt()\`:
- GPT đang được gọi → GPT là **assistant** trong messages
- Claude là **user** (model "đối phương")

Trong \`call_claude()\`:
- Claude đang được gọi → Claude là **assistant**
- GPT là **user**

**Cùng một text** ("Hi there") có thể có role khác nhau tùy đang gọi model nào. Role không gắn cứng với "ai nói" — gắn với **góc nhìn của model đang gọi**.

**Đây là pattern cốt lõi của multi-agent system:**
- Mỗi agent là một LLM với perspective riêng
- Các agent collaborate qua "messages" — nhưng mỗi agent "thấy" messages từ góc nhìn của nó
- Sai pattern này → model confuse, output rác

Tuần 8 sẽ scale lên 7 agent — vẫn dùng pattern này.
`
        },
        {
            title: "Bước 8 — Chạy conversation 5 lượt",
            lang: "python",
            before: `
**Test conversation.** Cho GPT (argumentative) vs Claude (polite) "cãi nhau" 5 lượt, in ra mỗi reply.
`,
            code: `gpt_messages = ["Hi there"]
claude_messages = ["Hi"]

display(Markdown(f"### GPT:\\n{gpt_messages[0]}\\n"))
display(Markdown(f"### Claude:\\n{claude_messages[0]}\\n"))

for i in range(5):
    gpt_next = call_gpt()
    display(Markdown(f"### GPT:\\n{gpt_next}\\n"))
    gpt_messages.append(gpt_next)

    claude_next = call_claude()
    display(Markdown(f"### Claude:\\n{claude_next}\\n"))
    claude_messages.append(claude_next)`,
            after: `
**Output điển hình:**

\`\`\`
GPT: "Oh, hi yourself. What's so interesting about saying 'hi'?"
Claude: "You're absolutely right, I apologize. Is there anything specific you'd like to discuss?"
GPT: "Apologize? For what? Don't be so quick to back down."
Claude: "That's a great point - I shouldn't be so quick to apologize..."
...
\`\`\`

**Personalities thể hiện rõ:**
- GPT bám "argumentative, snarky" — challenge mọi thứ Claude nói
- Claude bám "polite, find common ground" — tìm cách hòa giải

**Quan sát thú vị:** Claude (do RLHF của Anthropic về safety/helpful) thường **vẫn polite** ngay cả khi GPT khiêu khích. Còn GPT bám personality "argumentative" rất tốt.

**Bài tập mở rộng:** thêm Gemini làm 'mediator' → 3-way conversation. Thầy gợi ý dùng **1 system + 1 user prompt** mỗi turn, trong user prompt liệt kê toàn bộ conversation so far — đơn giản hơn 3-way alternating.
`
        }
    ]
});
