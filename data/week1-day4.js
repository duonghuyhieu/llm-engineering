window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 1,
    day: 4,
    title: "Transformer · Tokens · Tokenizer · Context Window · Stateless principle",
    notebooks: ["week1/day4.ipynb"],
    topics: [
        "Transformer architecture — kiến trúc đứng sau mọi LLM hiện đại",
        "Tokens — sự thỏa hiệp giữa character-level và word-level",
        "Tokenization với tiktoken (OpenAI)",
        "Context window — RAM của model",
        "Stateless principle — LLM không tự nhớ gì",
        "Cách 'tạo' memory bằng cách gửi lại history"
    ],
    summary: `
## 1. Transformer — kiến trúc thay đổi mọi thứ

Trước 2017, NLP chủ yếu dùng RNN/LSTM — xử lý token tuần tự, chậm và quên context dài. Paper **"Attention Is All You Need"** (Google, 2017) giới thiệu **Transformer** với cơ chế **self-attention** cho phép xử lý song song toàn bộ sequence.

Từ đó: GPT, BERT, T5, LLaMA, Claude — tất cả đều là Transformer biến tấu.

**Cơ chế self-attention (rút gọn):** với mỗi token, model tính 3 vector — Query, Key, Value. Score giữa token i và j = Q_i · K_j. Token i sẽ "chú ý" tới j theo trọng số softmax của các score này.

Hệ quả thực tế:
- **Cost O(n²)** với n = số token → là lý do context window không thể vô hạn
- **Mọi token đều có thể giao tiếp với mọi token khác** — không bị giới hạn khoảng cách như RNN
- Train song song được trên GPU → scale lên hàng tỷ params khả thi

## 2. Quy mô parameters — không phải tất cả

| Model | Params | Ghi chú |
|---|---|---|
| BERT base | 110M | NLP cổ điển |
| GPT-2 | 1.5B | Bùng nổ generative |
| GPT-3 | 175B | ChatGPT đời đầu |
| LLaMA 3.1 405B | 405B | Open-weight lớn nhất |
| GPT-4 | ~1.8T (MoE) | Mixture of Experts |
| DeepSeek V3 | 671B (MoE) | Open-weight, cạnh tranh GPT-4 |

Số parameters lớn hơn ≠ tự động thông minh hơn. Quality data + training compute mới quan trọng (Tuần 4 sẽ học về Chinchilla Scaling Law).

## 3. Tokens — sự thỏa hiệp giữa character và word

Lịch sử input của neural network NLP:

| Cấp độ | Vocab | Vấn đề |
|---|---|---|
| Character | ~100 | Model phải học mọi thứ từ ký tự — chậm, kém |
| Word | hàng triệu | Vocab nổ, không xử lý được từ hiếm |
| **Subword (token)** | 30K–200K | Sweet spot |

Một token có thể là 1 từ phổ biến (\`the\`), 1 phần của từ (\`un-\`, \`-ing\`), 1 ký tự (cho từ hiếm), hoặc cả cụm common (\` of the\`).

**Quy tắc nhanh:** 1 token ≈ 4 ký tự tiếng Anh ≈ 0.75 từ.

## 4. Context window — RAM của model

| Model | Context window |
|---|---|
| GPT-3.5 cũ | 4K |
| GPT-4 turbo | 128K |
| Claude 4.5 | 200K |
| Gemini 2.5 Pro | 1M+ |

Lưu ý:
- Context lớn = chi phí lớn (O(n²) attention)
- Performance giảm khi gần đầy context (\`lost in the middle\` effect)
- Cached input rẻ hơn fresh input ~5–10×
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho context window:** Coi như RAM của LLM. Càng to càng thoải mái, nhưng càng đắt, càng chậm, và bạn vẫn phải quyết định nhét gì vào RAM (bài toán của RAG ở Tuần 5)."
        },
        {
            type: "info",
            text: "**Mental model cho stateless:** LLM giống một bác sĩ amnesia hoàn toàn — mỗi lần bạn vào phòng khám, phải kể lại toàn bộ tiền sử. 'Trí nhớ' là cuốn sổ bạn (developer) cầm theo, không phải của bác sĩ."
        },
        {
            type: "warn",
            text: "**Đừng nhầm 'memory' của ChatGPT consumer với API.** ChatGPT product có tính năng Memory (lưu fact xuyên session). API thuần KHÔNG có. Nếu bạn build chatbot và muốn memory, phải tự implement (DB + summarization + RAG)."
        }
    ],
    keyPoints: [
        "**Self-attention là O(n²) memory và compute.** Với n=100K tokens, là 10 tỷ phép tính chỉ cho attention. Đây là rào cản chính của context dài.",
        "**Decoder-only Transformer** là kiến trúc chuẩn cho LLM hiện đại (GPT, LLaMA, Claude). Encoder-only (BERT) cho classification/embedding. Encoder-decoder (T5) cho translation.",
        "**Tokenizer ảnh hưởng trực tiếp tới chi phí.** Tiếng Việt tốn nhiều token hơn tiếng Anh ~1.5–2× với hầu hết tokenizer phương Tây.",
        "**Context window không phải free RAM.** Nhồi 100K token vào prompt vừa đắt vừa kém — model dễ 'lạc giữa'. RAG với top-k chunks thường tốt hơn dump cả document.",
        "**Stateless = bug cũng = feature.** Bug: phải tự quản lý history. Feature: dễ scale (mọi instance LLM identical), dễ debug (request/response replay được).",
        "**Cost = input_tokens × $/M_in + output_tokens × $/M_out.** Output thường đắt hơn input ~5×. Cached input rẻ hơn fresh ~10×."
    ],
    code: [
        {
            title: "Bước 1 — Tokenize với tiktoken: xem GPT 'nhìn' text thế nào",
            lang: "python",
            before: `
**Concept của tokenization** trừu tượng. Cách dễ nhất hiểu: xem nó hoạt động. Library \`tiktoken\` của OpenAI implement đúng tokenizer GPT đang dùng — chạy local, không tốn API.
`,
            code: `import tiktoken

encoding = tiktoken.encoding_for_model("gpt-4.1-mini")

tokens = encoding.encode("Hi my name is Ed and I like banoffee pie")
print(tokens)
# [13347, 856, 836, 482, 28069, 268, 358, 1093, 326, 17699, 1561, 4447]

# Decode từng token để xem nó tương ứng với chữ gì
for token_id in tokens:
    token_text = encoding.decode([token_id])
    print(f"{token_id} = {token_text}")`,
            after: `
**Output mẫu:**

\`\`\`
13347 = Hi
856   =  my
836   =  name
482   =  is
28069 =  Ed
268   =
358   =  I
1093  =  like
326   =  ban       ← 'banoffee' bị tách thành 3 tokens
17699 = off
1561  = ee
4447  =  pie
\`\`\`

**Quan sát quan trọng:**

- Từ phổ biến như \`Hi\`, \`name\`, \`is\` → 1 token mỗi từ
- Từ hiếm như \`banoffee\` → 3 tokens (\`ban\` + \`off\` + \`ee\`)
- **Whitespace đi kèm token sau** (\` my\` chứ không phải \`my\`) — quirk của BPE tokenizer
- Tên người \`Ed\` được tách: \`Ed\` đứng riêng vì là từ phổ biến tiếng Anh

**Hệ quả thực tế:** tiếng Việt tốn nhiều token hơn tiếng Anh ~1.5–2× vì hầu hết từ tiếng Việt là "hiếm" trong corpus training của GPT (chủ yếu tiếng Anh). Đoạn 1000 ký tự tiếng Anh ≈ 250 tokens, tiếng Việt ≈ 500 tokens.
`
        },
        {
            title: "Bước 2 — Validate API key và setup OpenAI client",
            lang: "python",
            before: `
**Setup phổ biến cho mọi notebook.** Cell này sẽ lặp lại hầu như mọi day — Edward Donner gọi nó là "boilerplate Day 1 đã quen". Sau Day 4 sẽ ngầm hiểu, không giải thích lại.
`,
            code: `import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)
api_key = os.getenv('OPENAI_API_KEY')

if not api_key:
    print("No API key was found")
elif not api_key.startswith("sk-proj-"):
    print("An API key was found, but it doesn't start sk-proj-")
else:
    print("API key found and looks good so far!")

# Create OpenAI client
openai = OpenAI()`,
            after: `
**Lưu ý:** \`OpenAI()\` không truyền argument — tự tìm \`OPENAI_API_KEY\` trong env. Sau khi load env ở dòng đầu, mọi thứ "just work".

Sau khi setup, biến \`openai\` là client global cho mọi call sau trong notebook.
`
        },
        {
            title: "Bước 3 — Lượt 1 của 'conversation': User giới thiệu tên",
            lang: "python",
            before: `
**Demo Stateless principle (phần 1).** Setup một câu chuyện 2 turn để chứng minh LLM KHÔNG tự nhớ. Trước hết, lượt 1: user nói tên mình.
`,
            code: `messages = [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hi! I'm Ed!"}
]

response = openai.chat.completions.create(model="gpt-4.1-mini", messages=messages)
response.choices[0].message.content
# Output: "Hi Ed! How can I assist you today?"`,
            after: `
Model nhận ra tên user là "Ed" — reply phù hợp. Đến đây mọi thứ normal.

Bước tiếp theo sẽ test xem model có thực sự "nhớ" tên này không…
`
        },
        {
            title: "Bước 4 — Lượt 2: User hỏi 'Tên tôi là gì?' (KHÔNG truyền history)",
            lang: "python",
            before: `
**The 'gotcha' moment.** Gọi LLM lần 2 với câu hỏi follow-up, NHƯNG không truyền messages của lượt 1.
`,
            code: `messages = [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "What's my name?"}
]

response = openai.chat.completions.create(model="gpt-4.1-mini", messages=messages)
response.choices[0].message.content
# Output: "I don't have access to your name..."
# hoặc: "I'm not sure of your name. Could you tell me?"`,
            after: `
**Wait, what??**

Just told the model your name 1 cell ago. Tại sao nó quên?

**Vì mỗi call tới LLM là hoàn toàn STATELESS.** Hoàn toàn mới. Không có session, không có cookie, không có user identity. Mỗi request là một cuộc trò chuyện mới với một AI mới hoàn toàn.

**Đây là điều quan trọng nhất Day 4 dạy:**

> Trách nhiệm 'tạo ra trí nhớ' là của AI engineer, không phải của LLM.

Mỗi lần gọi LLM, *bạn* (code) phải truyền toàn bộ history trong \`messages\`. Đó là cách ChatGPT có vẻ "nhớ" tên bạn — frontend gửi lại history mỗi lần.
`
        },
        {
            title: "Bước 5 — Lượt 2 (lần này đúng): Truyền lại history",
            lang: "python",
            before: `
**Cách 'tạo' memory.** Gửi lại toàn bộ history trong messages. Mỗi turn cũ là một message với role tương ứng (\`user\` cho input cũ, \`assistant\` cho output cũ).
`,
            code: `messages = [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hi! I'm Ed!"},
    {"role": "assistant", "content": "Hi Ed! How can I assist you today?"},
    {"role": "user", "content": "What's my name?"}
]

response = openai.chat.completions.create(model="gpt-4.1-mini", messages=messages)
response.choices[0].message.content
# Output: "Your name is Ed!"`,
            after: `
**Giờ thì work.** Model trả lời đúng vì *thấy* trong messages của request hiện tại có thông tin "I'm Ed!".

**Cấu trúc messages cho multi-turn:**

\`\`\`
[
    {role: "system",    ...},  # 1 lần, đặt vai trò
    {role: "user",      ...},  # input turn 1
    {role: "assistant", ...},  # reply turn 1
    {role: "user",      ...},  # input turn 2
    {role: "assistant", ...},  # reply turn 2
    {role: "user",      ...},  # input turn hiện tại
]
\`\`\`

**Convention:**
- System message ở đầu (chỉ 1)
- User và assistant **luôn alternating** (vi phạm → API có thể reject với 400)
- Message cuối thường là user (LLM sẽ generate reply mới)

**Cost implication:** mỗi turn, bạn trả tiền cho **toàn bộ** input tokens (cả history). Cuộc trò chuyện càng dài → cost mỗi turn càng tăng. Đây là lý do prompt caching và summarization quan trọng (sẽ học sau).
`
        },
        {
            title: "Bước 6 — Đếm token để dự đoán chi phí",
            lang: "python",
            before: `
**Cost = tokens × price.** Trước khi gọi API, đếm token để biết sẽ trả bao nhiêu. Đặc biệt quan trọng khi prompt dài (nhồi context, RAG).
`,
            code: `import tiktoken

def count_tokens(text, model="gpt-4.1-mini"):
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

# Đoạn text dài
doc = open("week1/scraper.py").read()
print(f"Doc: {count_tokens(doc)} tokens")

# Ước tính chi phí — gpt-4.1-mini: $0.40/M input, $1.60/M output
n_in = count_tokens(doc)
n_out = 200  # giả sử output ~200 tokens
cost = (n_in / 1_000_000) * 0.40 + (n_out / 1_000_000) * 1.60
print(f"Estimated cost: $\${cost:.6f}")`,
            after: `
**Output mẫu:**

\`\`\`
Doc: 1247 tokens
Estimated cost: $0.000819
\`\`\`

**Đọc giá:** giá per million tokens. 1M tokens = ~750K từ ≈ 1500 trang giấy.

| Model | Input $/M | Output $/M |
|---|---|---|
| GPT-4.1-mini | $0.40 | $1.60 |
| GPT-5 | ~$10 | ~$30 |
| Claude Haiku 4.5 | $0.80 | $4.00 |
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Gemini 2.5 Flash | $0.10 | $0.30 |

**Quy luật ngón tay:**
- Output đắt hơn input ~5×
- Reasoning models (\`o3\`, GPT-5) đắt hơn chat models 5–10×
- Cached input rẻ hơn fresh input ~5–10×

Cho hobby project, GPT-4.1-mini hoặc Gemini 2.5 Flash là sweet spot.
`
        }
    ]
});
