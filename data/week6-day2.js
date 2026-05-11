window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 6,
    day: 2,
    title: "LLM-powered Data Pre-processing · Groq Batch API · 800K items dưới $30",
    notebooks: ["week6/day2.ipynb"],
    topics: [
        "LLM rewrite product descriptions thành format chuẩn",
        "SYSTEM_PROMPT với format strict (Title, Category, Brand, Description, Details)",
        "Test với Groq (cloud), Ollama (local)",
        "Batch API JSONL format",
        "Groq Batch jobs - 22K items dưới $1",
        "Push processed dataset (\`items_lite\`, \`items_full\`)"
    ],
    summary: `
## 1. Tại sao pre-process với LLM

Raw Amazon descriptions có vấn đề:
- **Inconsistent format**: mỗi seller viết style khác
- **Marketing fluff**: "BEST DEAL EVER!!! ⭐⭐⭐⭐⭐ Limited time only!!"
- **HTML/Unicode noise**: tags, special chars
- **Length variance**: từ 50 chars tới 5000+ chars

**Trước LLM:** clean bằng regex + nltk + custom rules → fragile, hard to maintain.

**Sau LLM:** prompt → "extract title, category, brand, description, details" → done. **5 dòng code thay vài trăm dòng regex.**

## 2. Format chuẩn output

\`\`\`
Title: Rewritten short precise title
Category: Electronics
Brand: Brand name
Description: 1 sentence description
Details: 1 sentence on features
\`\`\`

**Tại sao 5 fields:**
- **Title**: clean version, no marketing
- **Category**: standardized taxonomy
- **Brand**: extract dù description không phải dạng "Brand: X"
- **Description**: 1-sentence summary — model học từ đây
- **Details**: features — bổ sung context

**Format này 'sạch'** cho ML training. Đồng nhất, ngắn, focused.

## 3. Cost economics — 800K items dưới $30

Strategy: **Batch API + cheap model**.

- Model: \`gpt-oss-20b\` qua Groq (open-source, fast inference)
- Batch API: 50% off so với realtime
- Cost cho 800K items: ~$30 trên Groq

So sánh:
- Realtime API GPT-5: ~$2,000 cho 800K items
- Batch GPT-5: ~$1,000
- Batch GPT-OSS qua Groq: ~$30 ← chosen

**Open-source qua chip company** (Groq) là sweet spot cost cho task này.

## 4. JSONL format cho batch

Batch API yêu cầu JSONL — mỗi line là 1 request standalone:

\`\`\`json
{"custom_id": "0", "method": "POST", "url": "/v1/chat/completions", "body": {...}}
{"custom_id": "1", "method": "POST", "url": "/v1/chat/completions", "body": {...}}
...
\`\`\`

\`custom_id\` cần thiết để map output back vào items (output cũng JSONL).

## 5. \`Batch\` class wrap workflow

Notebook expose \`pricer.batch.Batch\` class:
- \`create(items, lite_mode)\`: build JSONL files chia thành chunks 1000 items
- \`run()\`: submit batches lên Groq
- \`fetch()\`: poll status, download results khi done
- Auto-assign \`item.summary\` từ response

Pattern này abstract batch complexity → 3 dòng code thay 50+ dòng manual.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho Batch API:** Coi như gửi bưu kiện thường thay vì express. Bưu kiện thường rẻ một nửa, đi 24h thay vì vài giờ. Phù hợp khi không vội. Realtime API = express delivery."
        },
        {
            type: "warn",
            text: "**Đừng dùng batch cho production user-facing.** Batch trễ có thể fail (validation error, content moderation). Build retry và fallback. Cho indexing offline thì OK."
        }
    ],
    keyPoints: [
        "**LLM preprocessing thay thế nhiều regex/rules.** Đặc biệt cho data dirty từ user input, web scrape.",
        "**Batch 50% off thường đáng dùng cho task không realtime.** Indexing, backfill, eval — đều fit batch model.",
        "**JSONL = JSON Lines.** Mỗi dòng JSON object đứng độc lập. Format chuẩn cho streaming, batch, logs.",
        "**Tracking với custom_id quan trọng.** Khi parse output batch, cần map ngược lại item nào.",
        "**Groq (chip company) khác xAI Grok (LLM).** Groq host open-source models với LPU chip — fast và cheap.",
        "**Lite mode pattern**: làm việc nhỏ trong notebook trước khi commit full run."
    ],
    code: [
        {
            title: "Bước 1 — Setup + decide lite vs full mode",
            lang: "python",
            before: `
**Critical decision đầu notebook.** \`LITE_MODE = True\` cho fast iteration ($0-1). \`False\` cho full run ($30).

Lite = 22K items, full = 820K items.

**Pattern dev workflow:** lite mode cho 90% time, full mode cho final run.
`,
            code: `from litellm import completion
from dotenv import load_dotenv
import json
from pricer.batch import Batch
from pricer.items import Item

load_dotenv(override=True)

# DECISION
LITE_MODE = True   # True = 22K items ($0-1). False = 820K items ($30)

# Load dataset từ HF Hub (đã push Day 1)
username = "ed-donner"
dataset = f"{username}/items_raw_lite" if LITE_MODE else f"{username}/items_raw_full"

train, val, test = Item.from_hub(dataset)
items = train + val + test

print(f"Loaded {len(items):,} items")
print(items[0])`,
            after: `
**Mổ xẻ:**

**\`Item.from_hub()\`** helper class load:
- Pull data từ HF Hub (cached local sau lần đầu)
- Parse rows thành Item objects
- Returns (train, val, test) tuple

**Quan sát:** \`items = train + val + test\` — combine tất cả vì Day 2 chỉ pre-process, chưa split. Day 3 sẽ re-split.

**Lite vs Full economics:**

| Mode | Items | Time | Cost | Use case |
|---|---|---|---|---|
| Lite | 22K | ~10 phút | $0-1 | Iterate prompt, validate pipeline |
| Full | 820K | ~2 giờ | $30 | Final dataset cho training |

**Pattern thực tế:** spend 2-3 hours với lite mode để tune prompt + verify output quality. Khi happy, 1 command \`LITE_MODE = False\` → full run overnight.
`
        },
        {
            title: "Bước 2 — System prompt định dạng output",
            lang: "python",
            before: `
**Strict format prompt.** Output **format-restricted** quan trọng cho data pipeline — parse downstream dễ.

5 fields với ":" separator. Multi-line nhưng predictable structure.
`,
            code: `# Assign ID cho mỗi item (để track trong batch)
for index, item in enumerate(items):
    item.id = index

SYSTEM_PROMPT = """Create a concise description of a product. Respond only in this format. Do not include part numbers.
Title: Rewritten short precise title
Category: eg Electronics
Brand: Brand name
Description: 1 sentence description
Details: 1 sentence on features"""

print(items[0].full)
# Original raw text — messy, long, marketing-heavy`,
            after: `
**Mổ xẻ prompt design:**

- **"Create a concise description"** — task goal
- **"Respond only in this format"** — bám format strict
- **"Do not include part numbers"** — anti-pattern (part numbers add noise)
- **5 fields** với label + colon — easy parse

**Tại sao format strict matter:**

Day 3 sẽ extract features từ \`item.summary\` cho ML training. Format nhất quán → parsing đơn giản. Format hỗn loạn → cần regex phức tạp + edge cases.

**Pattern này áp dụng cho mọi data cleaning với LLM:**

1. Define output format explicit
2. Anti-instructions ("Do not include X")
3. Test với vài samples trước batch lớn
4. Validate sample outputs match format
5. Run batch

**Common pitfall:** quên test format consistency. LLM với same prompt có thể trả output slightly different format. Pre-validate trên 20-50 samples trước commit full batch.
`
        },
        {
            title: "Bước 3 — Test trên 1 item với Groq",
            lang: "python",
            before: `
**Pre-validate format.** Test 1 item trước khi commit batch lớn — cheap sanity check.

\`gpt-oss-20b\` qua Groq là sweet spot: cheap + fast inference. \`reasoning_effort="low"\` vì task này không cần deep thinking.
`,
            code: `messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": items[0].full},
]

response = completion(
    messages=messages,
    model="groq/openai/gpt-oss-20b",
    reasoning_effort="low",
)

print(response.choices[0].message.content)
print()
print(f"Input tokens: {response.usage.prompt_tokens}")
print(f"Output tokens: {response.usage.completion_tokens}")
print(f"Cost: {response._hidden_params['response_cost']*100:.3f} cents")

# Output:
# Title: Bosch SilencePlus 42 dBA Built-In Dishwasher
# Category: Appliances
# Brand: Bosch
# Description: A quiet built-in dishwasher with 42 dBA noise level.
# Details: Features 14 place settings, 4 wash cycles, top control panel.
#
# Input tokens: 387
# Output tokens: 62
# Cost: 0.045 cents`,
            after: `
**Quan sát:**

- **Format đúng** — 5 fields, đúng order, đúng labels
- **Length:** ~62 output tokens. Concise.
- **Cost: 0.045 cents/item.** Cho 22K items = $10. Cho 820K = $370 (đắt — nhưng batch 50% off → $185).

**Hmm $185 vẫn cao.** Edward dùng pattern khác để xuống $30:

1. **Groq Batch API** (50% off realtime)
2. **Use \`gpt-oss-20b\`** thay vì model lớn hơn
3. **Batch trong 24h SLA** (không phải realtime)

Final cost ~$30 cho 800K items.

**Test 2: try Ollama (local, free)**

\`\`\`python
response = completion(
    messages=messages,
    model="ollama/llama3.2",
    api_base="http://localhost:11434",
)
\`\`\`

Cost = $0. Quality? Có thể tệ hơn — model nhỏ (3B vs 20B). Test sample, compare. Nếu acceptable → $0 cost win.

**Decision tree:**
- Lite mode + Ollama local = $0, có thể slow
- Full mode + Groq batch = $30, fast (24h SLA)
- Full mode + Ollama = $0 nhưng có thể chậm 24+ giờ trên CPU

Pick based on hardware + budget.
`
        },
        {
            title: "Bước 4 — Build JSONL cho batch submission",
            lang: "python",
            before: `
**Batch API yêu cầu JSONL** — mỗi line là 1 request standalone.

**Key fields:**
- \`custom_id\`: để map output back về item nào
- \`method\` + \`url\`: HTTP details
- \`body\`: actual request payload
`,
            code: `MODEL = "openai/gpt-oss-20b"

def make_jsonl(item):
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": item.full},
        ],
        "reasoning_effort": "low",
    }
    line = {
        "custom_id": str(item.id),
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": body,
    }
    return json.dumps(line)

# Test
print(make_jsonl(items[0]))
# Output: {"custom_id": "0", "method": "POST", "url": "/v1/chat/completions", "body": {...}}

# Write 1000 items thành 1 batch file
def make_file(start, end, filename):
    with open(filename, "w", encoding="utf-8") as f:
        for i in range(start, end):
            f.write(make_jsonl(items[i]))
            f.write("\\n")

make_file(0, 1000, "jsonl/0_1000.jsonl")`,
            after: `
**Mổ xẻ:**

- **\`custom_id\` MUST unique** per request trong batch. Convention: dùng item.id (chỉ số 0, 1, 2...).
- **\`method=POST\` + \`url=/v1/chat/completions\`**: standard endpoint.
- **\`body\`**: identical với realtime API request — same model, messages, params.

**Why 1000 items/file:**
- Groq batch giới hạn ~50K requests per batch
- File size dưới control (file 1000 items ~5MB)
- Easier để retry nếu 1 batch fail (chỉ rerun 1000, không phải 800K)

**Production pattern:**

\`\`\`
800K items / 1000 = 800 batch files
Submit tất cả → wait 24h SLA
Fetch results → combine → assign to items
\`\`\`

Day 2 wrap logic này trong \`Batch\` class — students không phải tự code 800 file manually.
`
        },
        {
            title: "Bước 5 — Submit batch lên Groq",
            lang: "python",
            before: `
**3-step batch submission:**

1. Upload JSONL file → get \`file_id\`
2. Create batch với \`file_id\` → get \`batch_id\`
3. Poll status → fetch results khi done

Workflow tương tự OpenAI Batch (Tuần 6 sẽ thấy lại với OpenAI fine-tuning).
`,
            code: `import os
from groq import Groq

groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Step 1: Upload file
with open("jsonl/0_1000.jsonl", "rb") as f:
    response = groq.files.create(file=f, purpose="batch")

file_id = response.id
print(f"Uploaded file ID: {file_id}")

# Step 2: Create batch
response = groq.batches.create(
    completion_window="24h",
    endpoint="/v1/chat/completions",
    input_file_id=file_id,
)
print(f"Batch ID: {response.id}")
print(f"Status: {response.status}")
# Status: validating → in_progress → completed

# Step 3: Poll status (do periodically)
result = groq.batches.retrieve(response.id)
print(f"Status: {result.status}")
# Khi completed:
# Status: completed
# Output file ID: file-...

# Download results
response = groq.files.content(result.output_file_id)
response.write_to_file("jsonl/batch_results.jsonl")`,
            after: `
**Status flow:**

\`\`\`
validating → in_progress → completed (hoặc failed)
\`\`\`

**Time:** thường <1 giờ cho batch 1000 items. SLA 24h là worst case.

**Output format JSONL:**

\`\`\`json
{"custom_id": "0", "response": {"body": {"choices": [{"message": {"content": "Title: ..."}}]}}}
{"custom_id": "1", "response": {"body": {...}}}
...
\`\`\`

Mỗi line tương ứng 1 request. \`custom_id\` matches input.

**Cost tracking:** Groq dashboard show cost per batch. Production track riêng để budget control.

**Error handling:**

Nếu 1 item fail (vd content moderation flag) → response field có \`error\` thay vì content. Pattern parse:

\`\`\`python
if "error" in result["response"]:
    # log error, skip item
    continue
content = result["response"]["body"]["choices"][0]["message"]["content"]
\`\`\`
`
        },
        {
            title: "Bước 6 — Parse results và assign vào items",
            lang: "python",
            before: `
**Match output → input.** Đọc JSONL response, extract content, dùng \`custom_id\` map về item.
`,
            code: `with open("jsonl/batch_results.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        json_line = json.loads(line)
        id = int(json_line["custom_id"])
        summary = json_line["response"]["body"]["choices"][0]["message"]["content"]
        items[id].summary = summary

# Verify
print(items[0].full)       # original
print()
print(items[0].summary)    # processed

# Output:
# Original:
# Title: Bosch SilencePlus 42 dBA Dishwasher SHX878WD5N...
# (full raw description with marketing fluff)
#
# Processed:
# Title: Bosch SilencePlus 42 dBA Built-In Dishwasher
# Category: Appliances
# Brand: Bosch
# Description: A quiet built-in dishwasher with 42 dBA noise level.
# Details: Features 14 place settings, 4 wash cycles, top control panel.`,
            after: `
**Mổ xẻ:**

- **\`int(json_line["custom_id"])\`**: custom_id là string trong JSONL, convert thành int để index list
- **\`items[id].summary = summary\`**: assign processed text vào field summary của item
- **\`item.full\` unchanged** — giữ raw cho debug/audit

**Compare original vs processed:**

- **Original 1500 chars** → **Processed 250 chars** (~6× compression)
- Marketing fluff removed
- Format standardized
- Brand/category explicit

**Day 3 sẽ dùng \`item.summary\`** làm input cho ML models. Format clean → features easy extract → model train tốt hơn.

**Validation step (recommended):**

\`\`\`python
# Check missing items (batch fail cho 1 số)
for index, item in enumerate(items):
    if not item.summary:
        print(f"Missing summary for item {index}")
\`\`\`

Nếu có miss, re-submit chỉ items missing — không phải full batch.
`
        },
        {
            title: "Bước 7 — Batch class wrap + push final dataset",
            lang: "python",
            before: `
**Production-quality batch workflow.** \`Batch\` class abstract Steps 4-6 phía trên thành 3 method calls.
`,
            code: `# Batch class trong pricer/batch.py
Batch.create(items, LITE_MODE)   # divides into chunks, builds JSONL
Batch.run()                        # submits to Groq, kicks off all batches
Batch.fetch()                      # polls + downloads + assigns to items

# Check missing
for index, item in enumerate(items):
    if not item.summary:
        print(f"Missing: {index}")

# Cleanup unused fields
for item in items:
    item.full = None    # don't need raw text anymore (processed = summary)
    item.id = None      # don't need id (was only for batch tracking)

# Push processed dataset lên Hub
username = "ed-donner"
full = f"{username}/items_full"
lite = f"{username}/items_lite"

if LITE_MODE:
    train = items[:20_000]
    val = items[20_000:21_000]
    test = items[21_000:]
    Item.push_to_hub(lite, train, val, test)
else:
    train = items[:800_000]
    val = items[800_000:810_000]
    test = items[810_000:]
    Item.push_to_hub(full, train, val, test)

    # Also push lite for fast iteration later
    train_lite = train[:20_000]
    val_lite = val[:1_000]
    test_lite = test[:1_000]
    Item.push_to_hub(lite, train_lite, val_lite, test_lite)`,
            after: `
**Final pipeline outputs:**

- **\`items_lite\`**: 22K items processed (cho fast iteration)
- **\`items_full\`**: 820K items processed (cho serious training)

Cả 2 trên HF Hub: [huggingface.co/datasets/ed-donner/items_lite](https://huggingface.co/datasets/ed-donner/items_lite)

**Costs summary:**

| Operation | Cost |
|---|---|
| HF dataset download | Free |
| LLM pre-processing (Lite, 22K) | <$1 (Groq batch) |
| LLM pre-processing (Full, 820K) | ~$30 (Groq batch) |
| Hub storage | Free |

**Pattern reuse:**

Day 3-5 chỉ cần \`Item.from_hub("ed-donner/items_full")\` — không phải redo curation hay pre-processing. Setup cost 1 lần, payoff cho mọi experiment sau.

**Lesson:** invest into data pipeline lần đầu → save hours của downstream work. **Pre-process step Day 2 = 1 ngày work + $30, saved hàng tuần experimentation.**
`
        }
    ]
});
