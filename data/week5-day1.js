window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 5,
    day: 1,
    title: "RAG fundamentals · 'Brute-force' RAG đầu tiên · Insurellm Knowledge Worker",
    notebooks: ["week5/day1.ipynb"],
    topics: [
        "Capstone Tuần 5: Insurellm Expert Knowledge Worker",
        "RAG là gì — 3 bước cốt lõi Retrieve → Augment → Generate",
        "Load knowledge base dạng dict",
        "Simple keyword matching (brute-force RAG)",
        "Augment context vào system prompt dynamic",
        "Gradio ChatInterface end-to-end"
    ],
    summary: `
## 1. Capstone Tuần 5

**Insurellm Expert Knowledge Worker** — chatbot Q&A cho nhân viên công ty bảo hiểm:
- Có **knowledge base**: employees + products + contracts + company info (markdown files)
- Cần **chính xác** (không hallucinate, không bịa thông tin sai)
- Cần **chi phí thấp** (nhân viên dùng hàng ngày)

Tuần 5 build từng level lên:
- **Day 1**: brute-force RAG với keyword matching (working baseline)
- **Day 2**: chunking + vector embeddings + Chroma DB
- **Day 3**: LangChain ráp toàn bộ thành production pipeline
- **Day 4**: Eval pipeline (MRR, nDCG, LLM-as-judge)
- **Day 5**: Advanced RAG (re-ranking, query rewriting)

## 2. RAG là gì — recap

**Retrieval-Augmented Generation** = trước khi LLM trả lời, **nhồi context relevant** vào prompt.

\`\`\`
User query
   ↓
[Retrieve]: tìm trong knowledge base → top-k chunks
   ↓
[Augment]: nhồi chunks vào system prompt làm context
   ↓
[Generate]: LLM trả lời dựa trên context cung cấp
\`\`\`

3 lợi ích lớn:
- **Knowledge mới nhất**: update DB không cần re-train
- **Privacy**: data riêng tư của công ty không gửi train model
- **Citation**: LLM có thể trích nguồn từ chunks

## 3. Brute-force RAG của Day 1

Day 1 chưa dùng vector embeddings. Cách "thô sơ" nhất: **keyword matching**.

- Knowledge base = \`dict[str, str]\` — key là tên (lancaster, carllm), value là content
- User hỏi: extract các từ trong query → check từ nào trùng key trong dict → lấy content tương ứng
- Augment vào system prompt

Đây là **technically RAG** (đủ Retrieve + Augment + Generate). Nhưng có 2 vấn đề lớn:
- Chỉ work với exact keyword match (sai chính tả, paraphrase → fail)
- Không scale với hàng nghìn documents

Day 2 sẽ thay bằng **vector embeddings** giải quyết 2 vấn đề này.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho RAG:** Coi như một intern thông minh nhưng không biết về công ty bạn. Bạn cho intern 1 tài liệu liên quan trước mỗi câu hỏi → intern trả lời chính xác. Không có tài liệu → intern đoán → sai. RAG = tự động pick tài liệu cho intern."
        },
        {
            type: "warn",
            text: "**Brute-force RAG fail với synonym và misspelling.** 'Who is Avery?' không match nếu key là 'lancaster'. Đây là lý do cần vector embedding (search by meaning, không phải keyword)."
        }
    ],
    keyPoints: [
        "**RAG = Retrieve + Augment + Generate.** Không có gì magic. Code chỉ vài chục dòng.",
        "**Knowledge base có thể đơn giản như dict.** Production thường dùng vector DB nhưng concept y hệt.",
        "**Augment vào system prompt, không phải user prompt.** Pattern: \`SYSTEM_PREFIX + relevant_context\` → đặt 'luật chơi' bao gồm context.",
        "**Gradio ChatInterface 1 dòng để demo nhanh.** Pattern Tuần 2 áp dụng cho mọi RAG prototype.",
        "**\`gpt-4.1-nano\` rất rẻ — phù hợp khi knowledge base lớn.** $0.10/M input → 1 query với 10K context ≈ $0.001.",
        "**RAG không cần fine-tune model.** Đây là điểm mạnh lớn nhất — chỉ tốn knowledge base + prompt engineering."
    ],
    code: [
        {
            title: "Bước 1 — Setup imports và LLM client",
            lang: "python",
            before: `
**Setup chuẩn cho RAG project.** Cần \`glob\` để discover files, \`pathlib\` để parse path, Gradio cho UI, OpenAI cho LLM.

\`gpt-4.1-nano\` chọn vì **rẻ nhất** — Day 1 chạy nhiều prototype, không cần model đắt.
`,
            code: `import os
import glob
from dotenv import load_dotenv
from pathlib import Path
import gradio as gr
from openai import OpenAI

load_dotenv(override=True)

MODEL = "gpt-4.1-nano"
openai = OpenAI()`,
            after: `
**Tại sao \`gpt-4.1-nano\`?**

| Model | Input $/M | Output $/M |
|---|---|---|
| gpt-4.1-nano | $0.10 | $0.40 |
| gpt-4.1-mini | $0.40 | $1.60 |
| gpt-4.1 | $2.00 | $8.00 |
| gpt-5 | $10 | $30 |

Cho task simple Q&A trên context cung cấp sẵn, \`nano\` đủ. **Augment với good context > sticker shock của model lớn**.

Quy tắc Tuần 5: cứ dùng nano cho prototype. Nếu accuracy không đủ → escalate lên mini/4.1. Hiếm khi cần lên 5.
`
        },
        {
            title: "Bước 2 — Load knowledge base dạng dict",
            lang: "python",
            before: `
**Knowledge base structure.**

\`knowledge-base/\` directory có 4 sub-folders:
- \`employees/\` — file MD cho mỗi nhân viên (vd \`HR Avery Lancaster.md\`)
- \`products/\` — file MD cho mỗi sản phẩm (vd \`Carllm.md\`)
- \`contracts/\`
- \`company/\`

**Pattern key extraction:** với employees, tên file dạng \`HR Avery Lancaster.md\` → \`Path(filename).stem.split(' ')[-1]\` = \`Lancaster\` (last name). Cho products, dùng nguyên filename.
`,
            code: `knowledge = {}

# Load employees - lấy last name làm key
filenames = glob.glob("knowledge-base/employees/*")

for filename in filenames:
    name = Path(filename).stem.split(' ')[-1]   # "HR Avery Lancaster.md" → "Lancaster"
    with open(filename, "r", encoding="utf-8") as f:
        knowledge[name.lower()] = f.read()

# Load products - lấy full filename
filenames = glob.glob("knowledge-base/products/*")

for filename in filenames:
    name = Path(filename).stem                   # "Carllm.md" → "Carllm"
    with open(filename, "r", encoding="utf-8") as f:
        knowledge[name.lower()] = f.read()

print(knowledge.keys())
# dict_keys(['lancaster', 'chen', 'thompson', ..., 'carllm', 'homellm', 'rellm'])`,
            after: `
**Mổ xẻ:**

- **\`glob.glob(...)\`**: list files match pattern. \`*\` matches mọi file.
- **\`Path(filename).stem\`**: lấy filename không có extension (\`.md\`).
- **\`.split(' ')[-1]\`**: tách bằng space, lấy element cuối. \`"HR Avery Lancaster" → ["HR", "Avery", "Lancaster"] → "Lancaster"\`.
- **\`.lower()\`**: lowercase để match khi user gõ \`"Lancaster"\` hoặc \`"lancaster"\`.

**Kết quả:** dict với keys là lowercase identifiers, values là content full markdown file.

**Pattern này hữu ích cho:**
- Demo / prototype nhanh
- Knowledge base nhỏ (<100 documents)
- Khi documents có "ID" rõ ràng (tên, mã sản phẩm)

**Hạn chế:**
- Match exact keyword only
- Không scale: 100K documents → query tốn nhiều memory
- Không hiểu semantic (paraphrase, synonym)

Day 2 sẽ thay bằng vector embedding để giải quyết.
`
        },
        {
            title: "Bước 3 — Simple retrieval: keyword matching",
            lang: "python",
            before: `
**Brute-force retrieval.** Logic: extract từng từ trong query, check từ nào trùng key trong knowledge dict → return content tương ứng.

**Quy tắc \`str.isalpha() or str.isspace()\`**: strip punctuation (?, ., !) trước khi split, để \`"Who is Lancaster?"\` → \`["who", "is", "lancaster"]\` thay vì \`["who", "is", "lancaster?"]\`.
`,
            code: `# Cách 1: explicit
def get_relevant_context_simple(message):
    text = ''.join(ch for ch in message if ch.isalpha() or ch.isspace())
    words = text.lower().split()
    relevant_context = []
    for word in words:
        if word in knowledge:
            relevant_context.append(knowledge[word])
    return relevant_context

# Cách 2: pythonic - dùng list comprehension
def get_relevant_context(message):
    text = ''.join(ch for ch in message if ch.isalpha() or ch.isspace())
    words = text.lower().split()
    return [knowledge[word] for word in words if word in knowledge]

# Test
get_relevant_context("Who is lancaster?")
# Returns: [<full content of Lancaster.md>]

get_relevant_context("Who is Lancaster and what is carllm?")
# Returns: [<Lancaster content>, <Carllm content>]`,
            after: `
**Mổ xẻ logic:**

1. \`''.join(ch for ch in message if ch.isalpha() or ch.isspace())\`: strip non-alphabetic chars (\`?\`, \`!\`, \`,\`) nhưng giữ space
2. \`.lower().split()\`: lowercase và split thành list words
3. \`[knowledge[word] for word in words if word in knowledge]\`: với mỗi word, nếu là key của knowledge → lấy content

**Strength:**
- Đơn giản, fast (O(n) per query)
- Có thể match multiple keys ("Lancaster and carllm" → 2 chunks)
- Không có dependency (không cần vector DB)

**Weakness:**

| Query thực | Match? | Tại sao |
|---|---|---|
| "Who is Lancaster?" | ✅ | Match "lancaster" |
| "Tell me about Avery" | ❌ | Avery không phải key (key là Lancaster) |
| "What products do you sell?" | ❌ | "products" không phải key của bất kỳ product nào |
| "Tell me about car insurance" | ❌ | "car" không match "carllm" |
| "Whos lancastr" (typo) | ❌ | Misspelled |

**4/5 case FAIL.** Đây là lý do real-world RAG dùng vector embeddings.
`
        },
        {
            title: "Bước 4 — Augment: nhồi context vào system prompt",
            lang: "python",
            before: `
**Pattern augment.** Take retrieved chunks (list strings) → format thành "additional context" → append vào system prompt.

Tách thành function riêng để dễ test và swap với version vector-based ở Day 3.
`,
            code: `SYSTEM_PREFIX = """
You represent Insurellm, the Insurance Tech company.
You are an expert in answering questions about Insurellm; its employees and its products.
You are provided with additional context that might be relevant to the user's question.
Give brief, accurate answers. If you don't know the answer, say so.

Relevant context:
"""

def additional_context(message):
    relevant_context = get_relevant_context(message)
    if not relevant_context:
        result = "There is no additional context relevant to the user's question."
    else:
        result = "The following additional context might be relevant in answering the user's question:\\n\\n"
        result += "\\n\\n".join(relevant_context)
    return result

# Test
print(additional_context("Who is Alex Lancaster?"))
# Output:
# The following additional context might be relevant in answering the user's question:
#
# # Avery Lancaster
# ## Summary
# ...full content of Lancaster.md...`,
            after: `
**Mổ xẻ design:**

- **\`SYSTEM_PREFIX\`** = "luật chơi" cố định. Định nghĩa:
  - Vai trò ("expert at Insurellm")
  - Constraint ("brief, accurate")
  - Fallback ("if you don't know, say so") — chống hallucinate

- **\`additional_context()\`** = dynamic part. Có 2 branch:
  - **No context found** → tell LLM rõ ("no additional context") → LLM sẽ trả lời từ knowledge chung hoặc nói không biết
  - **Has context** → format với header "additional context might be relevant" → LLM ưu tiên info này

**Tại sao thêm "might be relevant" không phải "is relevant"?**

Defensive — keyword matching có thể return false positive. Nếu user hỏi "Tell me about banoffee pie" và có file tên \`banoffee.md\` (vd về sản phẩm bảo hiểm Banoffee?) → match nhưng có thể không relevant. "Might be" cho LLM judgment để filter.

**Pattern này áp dụng cho mọi RAG:** never trust retrieval 100%. Wrap context với hedge language để LLM giữ skepticism.
`
        },
        {
            title: "Bước 5 — Chat function dùng RAG + Gradio UI",
            lang: "python",
            before: `
**End-to-end pipeline.** Combine retrieval + LLM + Gradio thành working chatbot.

Pattern \`chat(message, history)\` chuẩn Gradio ChatInterface (Tuần 2 Day 3).
`,
            code: `def chat(message, history):
    # 1. Retrieve + augment
    system_message = SYSTEM_PREFIX + additional_context(message)

    # 2. Build messages với system mới mỗi turn
    messages = [{"role": "system", "content": system_message}] + history + [{"role": "user", "content": message}]

    # 3. Generate
    response = openai.chat.completions.create(model=MODEL, messages=messages)
    return response.choices[0].message.content

# Launch UI
view = gr.ChatInterface(chat, type="messages").launch(inbrowser=True)`,
            after: `
**Mổ xẻ flow:**

1. **System message rebuild mỗi turn** với context riêng. Đây là **dynamic system prompt** từ Tuần 2 Day 3.
2. **History append** sau system message (như mọi chatbot).
3. **LLM call** standard.

**Test cases:**

\`\`\`
User: "Who is Lancaster?"
→ system message bao gồm Lancaster.md → LLM trả lời chi tiết về Avery Lancaster

User: "What is carllm?"
→ system message bao gồm Carllm.md → LLM mô tả sản phẩm

User: "Who is the CEO?"
→ "CEO" không phải key → no context → LLM nói "I don't have that info"
(Production cần thêm CEO vào knowledge base, hoặc dùng better retrieval)

User: "Tell me about car insurance"
→ "car" không match "carllm" → no context → LLM fails
(Day 2 sẽ fix bằng vector embedding — match by meaning)
\`\`\`

**Brute-force RAG working baseline đã có.** Day 2 nâng cấp lên vector-based.
`
        }
    ]
});
