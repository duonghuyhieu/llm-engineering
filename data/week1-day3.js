window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 1,
    day: 3,
    title: "Base · Chat · Reasoning models · RLHF · Chain-of-thought",
    notebooks: [],
    topics: [
        "Day không có lab — buổi concept và demo so sánh model",
        "3 'breed' của LLM: Base, Chat (Instruct), Reasoning",
        "RLHF — bước biến GPT-3 → ChatGPT",
        "Chain-of-thought prompting và sự ra đời reasoning models",
        "Train-time vs Inference-time scaling — 2 trục để tăng năng lực",
        "Hallucination — vì sao xảy ra và cách giảm",
        "Spectrum of agency — agentic AI ở các mức độ"
    ],
    summary: `
## 1. Day 3 = concept day

Đây là một trong vài ngày hiếm hoi không có lab notebook. Thầy lùi lại để cho kiến thức về **bản chất 3 loại model** trước khi đi tiếp. Đồng thời demo các sản phẩm Agentic mới nhất (Deep Research, Agent Mode, Claude Code) để cho học viên cảm nhận tương lai khóa học.

## 2. Ba 'breed' của LLM

Cùng một kiến trúc Transformer (Day 4 sẽ học sâu), nhưng *quy trình train* khác nhau cho ra ba loại model với hành vi rất khác:

| Loại | Bài toán train | Output style | Use case |
|---|---|---|---|
| **Base** | Predict next token trên corpus thô | Continue text | Hiếm dùng trực tiếp |
| **Chat / Instruct** | RLHF với data conversation | Reply theo turn | Chatbot phổ thông |
| **Reasoning** | RL với chain-of-thought rewards | "Think" rồi reply | Toán, code, logic phức tạp |

## 3. Ba giai đoạn tạo ra một Chat model

1. **Pre-training**: học predict next token trên hàng nghìn tỷ token web. Tốn ~99% compute toàn bộ training pipeline. Sản phẩm = **base model** (như GPT-3 nguyên thủy năm 2020).

2. **Supervised Fine-Tuning (SFT)**: train tiếp với dataset cặp (prompt, response) chất lượng cao do human viết. Model học theo format hỏi-đáp.

3. **Reinforcement Learning from Human Feedback (RLHF)**: human đánh giá xếp hạng nhiều output → train một reward model → dùng RL (PPO) để model tối ưu theo reward đó. Đây là bước biến GPT-3 → ChatGPT (2022).

## 4. Chain-of-thought (CoT) — gốc rễ của Reasoning models

Phát hiện 2022: chỉ cần thêm câu **"Let's think step by step"** vào cuối prompt → accuracy trên bài toán logic tăng đáng kể.

Lý do: model phải "nói ra" các bước trung gian → mỗi bước là một forward pass thêm → sequence dài hơn → "ngân sách compute" lớn hơn cho 1 câu trả lời.

Ý tưởng tiếp theo: thay vì *prompt* model think step-by-step, **train** nó tự think. OpenAI o-series (2024), DeepSeek-R1 (2024), Claude Sonnet 4.5 thinking đều train với data chứa chain-of-thought ẩn.

## 5. Spectrum of Agency

"Agentic" không phải binary mà là một dải mức độ tự chủ:

\`\`\`
Mức 0: Pure chat                        (ChatGPT thuần)
Mức 1: Tool calling                     (gọi search, calculator)
Mức 2: Multi-step planning              (lên kế hoạch nhiều bước)
Mức 3: Autonomous loop                  (tự lặp đến khi xong task)
Mức 4: Multi-agent collaboration        (nhiều LLM làm việc cùng nhau)
\`\`\`

Day 3 demo các sản phẩm Agentic mức cao của OpenAI/Anthropic:
- **ChatGPT Deep Research** — gửi 1 prompt, agent đọc 30+ nguồn, tạo report dạng paper
- **ChatGPT Agent Mode** — bật virtual browser, agent tự duyệt web để 'đặt bàn nhà hàng có món banoffee pie ở NYC tối nay'
- **Claude Code** — agent đọc/sửa/run code thật trong repo của bạn

Tuần 8 sẽ tự build hệ thống mức 3–4.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho 3 loại model:** Base = autocomplete trên steroids. Chat = base đã được dạy lễ phép. Reasoning = chat đã được dạy nháp ra giấy trước khi trả lời."
        },
        {
            type: "warn",
            text: "**Hallucination tăng khi prompt 'lừa'.** Câu hỏi giả định sai ('Tại sao Einstein đã sống ở Mỹ vào 1850?') → model thường 'chơi cùng' và bịa ra context. Luôn validate output cho task quan trọng."
        }
    ],
    keyPoints: [
        "**Một model có thể có nhiều variant.** Vd LLaMA 3.1 có \`Llama-3.1-8B\` (base) và \`Llama-3.1-8B-Instruct\` (chat). Khi tải về phải chọn đúng variant cho use case.",
        "**RLHF không phải bước duy nhất.** Có DPO (Direct Preference Optimization), Constitutional AI (Anthropic dùng), RLAIF (RL from AI Feedback). Tất cả thuộc họ 'alignment techniques'.",
        "**Reasoning ≠ luôn tốt hơn.** Cho task đơn giản (tóm tắt, viết email), reasoning model chỉ làm chậm và tốn tiền hơn. Dùng khi task có *nhiều bước logic*.",
        "**Hallucination tỉ lệ nghịch với độ phổ biến của fact.** Câu hỏi về Einstein → ít sai. Câu hỏi về người ít nổi tiếng → dễ bịa. Vì training data có nhiều/ít về chủ đề đó.",
        "**System prompt 'Let's think step by step' vẫn còn giá trị.** Với non-reasoning model (GPT-4.1-mini, Claude Haiku), CoT prompting thủ công vẫn cải thiện accuracy — và rẻ hơn dùng reasoning model.",
        "**Agentic AI = LLM + Loop + Tools.** Khái niệm cốt lõi: LLM trong vòng lặp, có thể gọi tools, dựa vào kết quả tool để quyết định bước tiếp theo. Không có gì magic."
    ],
    code: [
        {
            title: "Minh họa 1 — Base model dùng kiểu cũ (trước ChatGPT)",
            lang: "python",
            before: `
**Bối cảnh lịch sử.** Trước ChatGPT (11/2022), GPT-3 là **base model** thuần. Để dùng nó "hỏi đáp", người ta phải prompt theo pattern Q/A:
`,
            code: `# Cách prompt base model như GPT-3 davinci (legacy)

prompt = """Q: What is the capital of France?
A: Paris

Q: What is the capital of Japan?
A: Tokyo

Q: What is the capital of Vietnam?
A:"""

# Base model sẽ tiếp tục sequence:
# → " Hanoi"`,
            after: `
**Quan sát:**
- Base model không "biết" cấu trúc Q&A. Nó chỉ thấy đây là một sequence text và predict next token.
- Vì pattern Q/Q/Q lặp lại 3 lần → model học inferred rằng next token sau "A:" là một thành phố thủ đô.
- **Pattern này gọi là few-shot prompting** — đưa vài ví dụ trong prompt để model bắt chước format. Vẫn dùng cho chat model ngày nay, nhưng không cần thiết cho task đơn giản.

Sau ChatGPT, không ai dùng raw base model nữa (trừ research). Tất cả frontier API đều là chat hoặc reasoning variant.
`
        },
        {
            title: "Minh họa 2 — Chat model dùng cấu trúc messages",
            lang: "python",
            before: `
**Cùng câu hỏi với chat model.** Không cần Q/A pattern — chỉ gửi system + user message đúng format.
`,
            code: `from openai import OpenAI
openai = OpenAI()

resp = openai.chat.completions.create(
    model="gpt-4.1-nano",   # chat variant
    messages=[
        {"role": "system", "content": "You are a concise geography assistant."},
        {"role": "user",   "content": "What is the capital of Vietnam?"},
    ],
)
print(resp.choices[0].message.content)
# Output: "Hanoi"`,
            after: `
**Khác biệt vs base model:**
- Không cần few-shot examples. Model hiểu nhiệm vụ từ system prompt ("geography assistant") + user query.
- Output ngắn gọn theo style "concise" trong system prompt → chứng minh RLHF training đã hiệu quả.
- API hiện đại (OpenAI 2024+) chỉ expose chat/reasoning model — không có raw base model nữa (trừ provider đặc biệt).
`
        },
        {
            title: "Minh họa 3 — Reasoning effort: ngân sách 'nghĩ' của reasoning model",
            lang: "python",
            before: `
**Reasoning effort** là tham số đặc biệt của reasoning model (GPT-5, o-series). Quyết định **bao nhiêu token internal** model được dùng cho chain-of-thought ẩn trước khi trả lời.

| Effort | Token nội suy | Cost | Latency |
|---|---|---|---|
| minimal | vài trăm | 1× | ~1s |
| low | vài nghìn | 2× | ~3s |
| medium | 10–20K | 5× | 10s |
| high | 50K+ | 10–20× | 30s+ |
`,
            code: `easy_puzzle = [
    {"role": "user", "content":
        "You toss 2 coins. One of them is heads. "
        "What's the probability the other is tails? "
        "Answer with the probability only."},
]

# Minimal — gần như không reasoning
response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=easy_puzzle,
    reasoning_effort="minimal"
)
print(response.choices[0].message.content)

# Low — có chút thinking
response = openai.chat.completions.create(
    model="gpt-5-nano",
    messages=easy_puzzle,
    reasoning_effort="low"
)
print(response.choices[0].message.content)`,
            after: `
**Câu đố này có 'trap':** Nếu mò vội, đáp 1/2. Nhưng đúng là **2/3** (conditional probability — biết có ít nhất 1 head → loại trừ trường hợp TT, còn HH, HT, TH → 2/3 trường hợp có 1 tail).

**Quan sát:**
- \`minimal\`: trả lời nhanh — thường sai (đáp 1/2)
- \`low\`: dành chút thời gian "nghĩ" — accuracy cao hơn (đáp 2/3)
- Cùng model, chỉ khác effort → kết quả khác hẳn

**Đây là minh chứng cho 2 trục scaling tách biệt:**
- **Train-time scaling**: model lớn hơn (nhiều params) → biết nhiều hơn intrinsically
- **Inference-time scaling**: cùng model nhưng cho 'nghĩ' lâu hơn → reasoning tốt hơn

Provider hiện đại tối ưu cả hai. User thấy "GPT-5" nhưng bên trong là router quyết định model size + reasoning effort dựa vào prompt.
`
        }
    ]
});
