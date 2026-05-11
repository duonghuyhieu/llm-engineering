window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 7,
    day: 2,
    title: "Prompt data preparation · Token counting · Base model LLaMA 3.2-3B",
    notebooks: ["week7/day2.ipynb"],
    topics: [
        "Load LLaMA 3.2-3B tokenizer",
        "Count tokens distribution của summary",
        "Determine CUTOFF cho truncation",
        "make_prompts() build prompt + completion format",
        "Round prices: tradeoff accuracy vs ease of learning",
        "Push prompts dataset lên HF Hub"
    ],
    summary: `
## 1. Day 2 - Prompt Data và Base Model

Trước khi train ở Day 3-4, phải chuẩn bị data đúng format cho fine-tuning.

**Pipeline Day 2:**

\`\`\`
items_full (Day 2 W6) → tokenize → analyze distribution
   ↓
Determine CUTOFF (limit prompt length)
   ↓
make_prompts(tokenizer, cutoff, do_round)
   → item.prompt + item.completion
   ↓
Push items_prompts_full lên HF Hub
\`\`\`

## 2. Base model choice: LLaMA 3.2-3B

**Vì sao LLaMA 3.2-3B (không phải 8B hoặc 70B):**

| Size | VRAM training | Time/epoch | Quality |
|---|---|---|---|
| 1B | ~2GB | ~30 phút | Decent |
| **3B** | **~4-5GB** | **~3-4 giờ** | **Sweet spot** |
| 8B | ~12GB | ~10 giờ | Top |
| 70B | ~80GB | Days | Top tier |

3B fit Colab T4 16GB thoải mái, train được trong 1 đêm. 8B push T4 limits — work nhưng slower.

## 3. Prompt format

Item class định nghĩa template:

\`\`\`python
PREFIX = "Price is $"
QUESTION = "What does this cost to the nearest dollar?"

# Prompt = QUESTION + summary + PREFIX
# Completion = "{price}.00" hoặc "{price}"
\`\`\`

Ví dụ:

\`\`\`
PROMPT:
What does this cost to the nearest dollar?

Title: Sony WH-1000XM5 Wireless Noise Canceling Headphones
Category: Electronics
Brand: Sony
Description: Premium noise-canceling headphones.
Details: 30-hour battery life, multi-device pairing.

Price is $

COMPLETION:
399.00
\`\`\`

**Tách prompt vs completion** quan trọng — fine-tuning chỉ compute loss trên completion. Model học generate completion từ prompt.

## 4. Round prices: tradeoff

**\`do_round=True\`** cho train+val: \`completion = "{round(price)}.00"\` thay vì \`"{price}"\`.

**Tại sao:**

- Original: $24.99, $129.95, $7.45 → mỗi giá là **3-4 tokens**
- Rounded: $25.00, $130.00, $7.00 → mỗi giá là **2-3 tokens** (predictable format)

Rounding **giảm output token count** → ít tokens to predict = easier task.

**Trade-off:** mất chính xác $0.01-0.99. Acceptable cho price estimation.

**\`do_round=False\`** cho test: giữ original price để evaluate exact.

## 5. Token CUTOFF

Inspect distribution → most summaries có 50-150 tokens. **CUTOFF=110** truncate ~5% items có summary quá dài.

**Tại sao cần CUTOFF:**
- Training batch require all sequences cùng length (padding)
- Max sequence dài → memory tăng quadratic (attention O(n²))
- Outlier 500+ token bias toàn batch

Setting consistent max length → training memory predictable.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho prompt format:** Coi như exam paper. Question (prompt) cố định. Answer (completion) là cái model học. Tách 2 phần rõ → model biết chỗ nào cần generate, chỗ nào context."
        },
        {
            type: "warn",
            text: "**Đừng quên tokenizer khớp model.** Day 2 dùng LLaMA 3.2 tokenizer cho LLaMA 3.2 model. Mix tokenizer X với model Y → garbage output."
        }
    ],
    keyPoints: [
        "**Tokenizer matter cho prompt length.** Same text → different token counts trên different tokenizers (Llama vs GPT vs Phi).",
        "**Round prices simplify completion.** \`$24.99\` (3 tokens) → \`$25.00\` (2 tokens). Easier cho model học.",
        "**CUTOFF balance memory + data retention.** Quá thấp → lose info. Quá cao → memory explode.",
        "**Push prompts dataset riêng** không thay items_full. Allows revisit raw data nếu cần re-process.",
        "**Validation set CŨNG round prices.** Consistency với train. Test giữ original để eval real performance.",
        "**Print sample prompt before training.** Verify format đúng — common bug source."
    ],
    code: [
        {
            title: "Bước 1 — Setup và load LLaMA 3.2-3B tokenizer",
            lang: "python",
            before: `
**Setup Day 2.** Login HF (LLaMA gated model — cần access), load tokenizer (model weights chưa cần ở step này — chỉ analyze tokens).

Tokenizer ~50MB download, fast. Model weights ~6GB sẽ load ở Day 3.
`,
            code: `import os
from dotenv import load_dotenv
from huggingface_hub import login
from pricer.items import Item
from tqdm.notebook import tqdm
from transformers import AutoTokenizer
import matplotlib.pyplot as plt

LITE_MODE = False
load_dotenv(override=True)
hf_token = os.environ['HF_TOKEN']
login(hf_token, add_to_git_credential=True)

# Load processed dataset từ Day 2 W6
username = "ed-donner"
dataset = f"{username}/items_lite" if LITE_MODE else f"{username}/items_full"
train, val, test = Item.from_hub(dataset)
items = train + val + test

print(f"Loaded {len(train):,} training, {len(val):,} val, {len(test):,} test")

# LLaMA 3.2-3B base model (KHÔNG phải Instruct)
BASE_MODEL = "meta-llama/Llama-3.2-3B"
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)`,
            after: `
**Mổ xẻ:**

**\`Llama-3.2-3B\` (not \`-Instruct\`):**

| Variant | Trained for | Khi nào dùng |
|---|---|---|
| Base | Continue text | Fine-tune cho task-specific format (output number) |
| Instruct | Conversation | Use directly hoặc fine-tune cho chat tasks |

Day 2 dùng **base** vì task output number, không phải conversation. Instruct variant có conversational biases có thể interfere.

**Gated model:** LLaMA gated → cần accept license trên HF UI trước. \`login(hf_token)\` authenticate. Nếu chưa accept → 403 Forbidden.

**Tokenizer download:**
- LLaMA 3.2 tokenizer: ~16MB
- Vocab size: 128,256 tokens
- Đã optimize cho code + multilingual

**Quick sanity check:**

\`\`\`python
print(tokenizer.encode("Price is $25.00"))
# [9, 0, 384, 13, 9, 5, 1024]
# Mỗi số là token id
\`\`\`
`
        },
        {
            title: "Bước 2 — Inspect token distribution",
            lang: "python",
            before: `
**Phân tích distribution** trước khi quyết định CUTOFF. Plot histogram số tokens trong mỗi summary.

\`add_special_tokens=False\`: không count BOS/EOS — chỉ content tokens.
`,
            code: `# Count tokens cho mỗi item.summary
token_counts = [item.count_tokens(tokenizer) for item in tqdm(items)]

# Plot histogram
plt.figure(figsize=(15, 6))
plt.title(f"Tokens in Summary: Avg {sum(token_counts)/len(token_counts):,.1f} and highest {max(token_counts):,}")
plt.xlabel('Number of tokens in summary')
plt.ylabel('Count')
plt.hist(token_counts, rwidth=0.7, color="skyblue", bins=range(0, 200, 10))
plt.show()`,
            after: `
**Distribution điển hình (820K items):**

\`\`\`
Avg: 65.4 tokens
Median: 60 tokens
P90: 95 tokens
P99: 145 tokens
Max: ~500 tokens (outliers)
\`\`\`

**Quan sát:**

- **Most summaries 30-100 tokens.** Day 2 W6 LLM pre-processing tạo concise summaries (~5 fields, 1 sentence each).
- **Long tail** đến 200+ tokens cho complex products.
- **Outliers** 500+ tokens — likely raw text bleed-through trong pre-processing.

**Implication cho CUTOFF:**

- CUTOFF=50 → truncate 60%+ items (mất info đáng kể)
- CUTOFF=100 → truncate ~15% items
- **CUTOFF=110 → truncate ~5%** items (acceptable trade-off)
- CUTOFF=200 → almost no truncation, nhưng memory tăng

**Choose CUTOFF=110:**

Loss ~5% items có long summaries, lift memory efficiency. 5% items có thể có patterns đặc biệt (luxury products?) — eval sau training để see impact.
`
        },
        {
            title: "Bước 3 — Determine CUTOFF",
            lang: "python",
            before: `
**Quantify trade-off.** Đếm bao nhiêu items bị truncate nếu chọn CUTOFF=110.
`,
            code: `CUTOFF = 110
cut = len([count for count in token_counts if count > CUTOFF])
print(f"With CUTOFF={CUTOFF}, will truncate {cut:,} items ({cut/len(items):.1%})")
# Output: With CUTOFF=110, will truncate 38,425 items (4.7%)`,
            after: `
**Mổ xẻ:**

- **38K items** trong 820K dataset bị truncate
- **4.7%** rate — acceptable
- Items bị cắt mất tail có thể quan trọng (specifications, model numbers) hoặc không (filler text)

**Pattern decision-making:**

\`\`\`
Trade-off curve:
CUTOFF | Truncate% | Memory | Quality impact
50     | 60%      | Low    | Significant data loss
80     | 25%      | Medium | Some loss
110    | 5%       | Med-Hi | Minor
150    | 1%       | Hi     | Negligible
200    | <0.1%    | Very Hi| None
\`\`\`

**Quy tắc:** chọn CUTOFF tại "elbow" của curve — point mà tăng CUTOFF không giảm truncation đáng kể. CUTOFF=110 đặt ở elbow.

**Production:** có thể experiment với multiple CUTOFFs:
- Train 3 models với CUTOFF 80, 110, 150
- Eval — chọn best balance

Day 2 dùng 110 fix để simplify.
`
        },
        {
            title: "Bước 4 — make_prompts: build prompt + completion",
            lang: "python",
            before: `
**Core function.** Build prompt format chuẩn cho fine-tuning. Sử dụng \`Item.make_prompts(tokenizer, cutoff, do_round)\`.

**Quy tắc \`do_round\`:**
- Train + Val: \`True\` (round to integer)
- Test: \`False\` (keep exact price)
`,
            code: `# Train + Val: round prices, dễ học
for item in tqdm(train + val):
    item.make_prompts(tokenizer, CUTOFF, do_round=True)

# Test: keep original prices cho eval
for item in tqdm(test):
    item.make_prompts(tokenizer, CUTOFF, do_round=False)

# Inspect sample
print("PROMPT:")
print(test[0].prompt)
print("\\nCOMPLETION:")
print(test[0].completion)`,
            after: `
**Output sample:**

\`\`\`
PROMPT:
What does this cost to the nearest dollar?

Title: Sony WH-1000XM5 Wireless Noise Canceling Headphones
Category: Electronics
Brand: Sony
Description: Premium noise-canceling wireless headphones with 30-hour battery.
Details: Multi-device pairing, adaptive sound control, hi-res audio support.

Price is $

COMPLETION:
399.00
\`\`\`

**Mổ xẻ structure:**

- **Question** "What does this cost to the nearest dollar?" — anchor cho task
- **Summary** từ Day 2 W6 (LLM pre-processed format)
- **Prefix** "Price is $" — model biết tiếp theo là number
- **Completion** "399.00" — what model học predict

**Tại sao tách prefix khỏi completion:**

Pattern: \`prompt = "...Price is $"\` + \`completion = "399.00"\`.

Trainer compute loss **chỉ trên completion**. Model học: "given prompt ending in 'Price is $', generate dollar amount".

**Compare alternatives:**

- **Bad:** prompt = "...What price?" / completion = "The price is $399.00" — model phải learn cả format text + number
- **Good:** prompt = "...Price is $" / completion = "399.00" — model focus learn number prediction

Format constraint reduces task complexity → easier learning với less data.

**\`do_round\` impact:**

- Train completion: "399.00" (4 chars, 2 tokens) — easy pattern
- Test completion: "399.99" (preserve original)

Test set có actual prices → MAE/RMSE accurate eval.
`
        },
        {
            title: "Bước 5 — Total prompt length distribution",
            lang: "python",
            before: `
**Verify final length.** Sau khi truncate + add prefix, distribution prompt+completion total tokens.
`,
            code: `prompt_token_counts = [item.count_prompt_tokens(tokenizer) for item in tqdm(items)]

plt.figure(figsize=(15, 6))
plt.title(f"Tokens (prompt + completion): Avg {sum(prompt_token_counts)/len(prompt_token_counts):,.1f} and highest {max(prompt_token_counts):,}")
plt.xlabel('Number of tokens in prompt and completion')
plt.ylabel('Count')
plt.hist(prompt_token_counts, rwidth=0.7, color="gold", bins=range(0, 200, 10))
plt.show()`,
            after: `
**Distribution mới (post-CUTOFF):**

\`\`\`
Avg: 95 tokens (summary 65 + prefix 25 + completion 5)
Median: 90 tokens
Max: 145 tokens
\`\`\`

**Quan sát:**

- **Capped at ~145**: max summary 110 + prefix + completion = ~145
- **Predictable**: training memory tính được trước
- **Compact**: ~95 avg, fit easily trong context

**Choose training config:**

- **\`max_length\` cho trainer**: 145 (covers max) hoặc 128 (round number, slight truncation)
- **Batch size**: phụ thuộc max_length × batch_size × hidden_size × overhead

Cho LLaMA 3.2 3B, T4 16GB, max_length=128:
- Batch size 8: ~6GB activation memory → fit

Day 3-4 sẽ tune training config dựa trên numbers này.
`
        },
        {
            title: "Bước 6 — Push prompts dataset lên HF Hub",
            lang: "python",
            before: `
**Final step.** Save dataset prompts (không phải raw items) lên Hub. Day 3-4 sẽ load này để train trực tiếp.

\`push_prompts_to_hub\` extract chỉ \`prompt\` và \`completion\` fields → smaller dataset, training-ready.
`,
            code: `username = "ed-donner"
dataset = f"{username}/items_prompts_lite" if LITE_MODE else f"{username}/items_prompts_full"

# Push (chỉ prompt + completion, không full Item)
Item.push_prompts_to_hub(dataset, train, val, test)

# Result: 2 datasets trên HF Hub
# https://huggingface.co/datasets/ed-donner/items_prompts_lite
# https://huggingface.co/datasets/ed-donner/items_prompts_full`,
            after: `
**Mổ xẻ:**

**\`push_prompts_to_hub\`** trong \`pricer/items.py\`:

\`\`\`python
def to_datapoint(self) -> dict:
    return {"prompt": self.prompt, "completion": self.completion}

@staticmethod
def push_prompts_to_hub(dataset_name, train, val, test):
    DatasetDict({
        "train": Dataset.from_list([item.to_datapoint() for item in train]),
        "val": Dataset.from_list([item.to_datapoint() for item in val]),
        "test": Dataset.from_list([item.to_datapoint() for item in test]),
    }).push_to_hub(dataset_name)
\`\`\`

**Dataset format:**

\`\`\`
HF Dataset:
{
  "prompt": "What does this cost...",
  "completion": "399.00"
}
\`\`\`

**Final dataset structure:**

| Dataset | Items | Use |
|---|---|---|
| \`items_raw_full\` (Day 1 W6) | 820K raw | Reference |
| \`items_full\` (Day 2 W6) | 820K processed | RAG, baselines |
| **\`items_prompts_full\` (Day 2 W7)** | **820K prompts** | **Fine-tuning** |

**3 dataset versions** — versioned, traceable. Pattern này critical cho ML reproducibility:
- Bug trong make_prompts → re-run, push v2 (không lose raw items)
- Want different CUTOFF? → re-run với CUTOFF=80, push as \`items_prompts_short\`

**Day 3-4 sẽ:**

\`\`\`python
from datasets import load_dataset
ds = load_dataset("ed-donner/items_prompts_full")
# Direct ready cho SFTTrainer
\`\`\`

**Day 2 complete.** Day 3-4 sẽ training thực sự trên Colab Pro+ A100.
`
        }
    ]
});
