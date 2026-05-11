window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 6,
    day: 5,
    title: "Fine-tune Frontier · OpenAI API · JSONL format · gpt-4.1-nano custom",
    notebooks: ["week6/day5.ipynb"],
    topics: [
        "OpenAI Fine-tuning API — managed SFT",
        "JSONL format cho training data",
        "100 examples vs 20,000 examples — diminishing returns",
        "Upload files → create job → poll → test",
        "Hyperparameters: n_epochs, batch_size, seed",
        "Compare fine-tuned variants với base model"
    ],
    summary: `
## 1. Day 5 — fine-tune frontier model

Day 4 baseline: gpt-4.1-nano zero-shot error $76. **Có thể cải thiện bằng cách fine-tune trên 100 example?**

Mục tiêu: tạo **custom GPT-4.1-nano** specialized cho price prediction từ Amazon description.

## 2. OpenAI Fine-tuning API — cơ chế

\`\`\`
1. Build JSONL training data
2. Upload files → file_id
3. Create fine-tuning job → job_id
4. Poll status (vài giờ → vài ngày)
5. Job complete → custom model_id
6. Call custom model như model thường, chỉ khác model name
\`\`\`

**JSONL format** chuẩn cho training:

\`\`\`json
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
\`\`\`

Mỗi dòng = 1 example. Model học input → output mapping.

## 3. Data size strategy

OpenAI recommend 50-100 examples. **Diminishing returns** beyond 1000-2000.

Edward experiment với 4 sizes:

| Size | Cost | Error |
|---|---|---|
| 100 examples | $0.10 | $96 |
| 2,000 examples | $1.50 | $79 (mini) / $82 (nano) |
| 20,000 examples | $3.42 | **$67** |

20K example improvement vs 100 example: $96 → $67 = **30% better**. Đáng đầu tư $3.

Beyond 20K → diminishing. 100K example có thể chỉ $5-10 better.

## 4. Hyperparameters

OpenAI fine-tuning expose ít HP:
- \`n_epochs\`: số lần pass full dataset (default auto)
- \`batch_size\`: số example per gradient update (default auto)
- \`learning_rate_multiplier\`: scale LR (default auto)
- \`seed\`: random seed cho reproducibility

Day 5 dùng \`n_epochs=1, batch_size=1\` — minimal training để demo.

## 5. Compare custom vs base

Sau fine-tune:
- **Base gpt-4.1-nano**: error $76 (Day 4)
- **Fine-tuned 100 examples**: error $96 — **TỆ HƠN base**
- **Fine-tuned 20K examples**: error $67 — **TỐT HƠN base**

**Big insight:** fine-tune với data ít có thể **làm hại** model. Chỉ với enough data mới giúp.

## 6. Vẫn chưa đủ tốt

XGBoost Day 3: $50. Fine-tuned nano 20K: $67.

**XGBoost vẫn win.**

Tuần 7 sẽ thử **QLoRA fine-tune open-source LLaMA** trên data này — expect beat both.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho fine-tuning:** Coi như đào tạo nhân viên đã có sẵn experience. Không 'dạy lại từ đầu' (pre-training), chỉ 'training về quy trình công ty bạn' (SFT). Hiệu quả khi nhân viên đã có nền tốt và quy trình rõ ràng."
        },
        {
            type: "warn",
            text: "**Đừng fine-tune để fix tất cả bugs.** Phàn nàn 'model trả lời sai facts' → KHÔNG fine-tune để memorize facts. Dùng RAG. Fine-tune sẽ kéo model bám lệch."
        }
    ],
    keyPoints: [
        "**Fine-tune ≠ giáo dục thêm.** Fine-tune dạy *format và style*, không dạy *facts mới*. Cho facts → RAG.",
        "**OpenAI Fine-tuning API là 'managed SFT'.** Convenient nhưng ít control. Cho kiểm soát đầy đủ → fine-tune open-source local.",
        "**Catastrophic forgetting là risk thực.** Fine-tuned model có thể tệ trên task khác task fine-tune.",
        "**Số học khó cho LLM.** Predict number qua language modeling là task không tự nhiên. Tuần 7 sẽ học sâu.",
        "**Fine-tuning data quality > quantity.** 100 example chất lượng cao tốt hơn 5000 example chất lượng thấp.",
        "**Diminishing returns sau ~2K examples.** Đầu tư cẩn thận data quality > quantity."
    ],
    code: [
        {
            title: "Bước 1 — Setup + chọn 100 examples cho fine-tune",
            lang: "python",
            before: `
**Day 5 setup tương tự Day 3-4** nhưng dùng OpenAI client thay LiteLLM (vì OpenAI Fine-tuning API specific).

**Strategy:** 100 train + 50 validation. OpenAI khuyến nghị 50-100 minimum. Edward show 100 ở notebook để demo nhanh.
`,
            code: `import os
import json
from dotenv import load_dotenv
from huggingface_hub import login
from openai import OpenAI
from pricer.items import Item
from pricer.evaluator import evaluate

LITE_MODE = False
load_dotenv(override=True)
hf_token = os.environ['HF_TOKEN']
login(hf_token, add_to_git_credential=True)

# Load dataset
username = "ed-donner"
dataset = f"{username}/items_lite" if LITE_MODE else f"{username}/items_full"
train, val, test = Item.from_hub(dataset)

openai = OpenAI()

# Sample 100 train + 50 val cho fine-tune
fine_tune_train = train[:100]
fine_tune_validation = val[:50]

print(f"Fine-tune train: {len(fine_tune_train)}")
print(f"Fine-tune val: {len(fine_tune_validation)}")`,
            after: `
**Tại sao chỉ 100 examples:**

OpenAI doc: "50-100 examples are usually enough for the model to learn".

**Reality:**
- 100 examples đủ để **change format/style** (output "$X.YZ" thay vì "$X.YZ explanation")
- KHÔNG đủ để **learn complex pattern** như price estimation từ description (rich domain)

Day 5 cố ý dùng 100 để show **fine-tune fail** trên small data. Sau đó scale lên 20K để show **lift thực sự**.

**Cost preview:**
- 100 examples × 200 tokens × 1 epoch = 20K tokens
- OpenAI fine-tune cost: ~$0.10 cho 100 examples
- Same với 20K examples: ~$3.40

Cheap experiment. Đáng try.
`
        },
        {
            title: "Bước 2 — Build messages format cho fine-tune",
            lang: "python",
            before: `
**JSONL format yêu cầu \`messages\` array với cả user + assistant.**

User = input (description). Assistant = expected output (price).

Đây là **supervised** signal: model học mapping input → expected output.
`,
            code: `def messages_for(item):
    message = f"Estimate the price of this product. Respond with the price, no explanation\\n\\n{item.summary}"
    return [
        {"role": "user", "content": message},
        {"role": "assistant", "content": f"\${item.price:.2f}"}
    ]

# Test
print(messages_for(fine_tune_train[0]))
# Output:
# [
#   {"role": "user", "content": "Estimate the price of this product...\\n\\nTitle: ..."},
#   {"role": "assistant", "content": "$129.99"}
# ]`,
            after: `
**Mổ xẻ:**

- **User message** = prompt y hệt Day 4 inference. Model sẽ học handle prompt này.
- **Assistant message** = ground truth answer. Format \`$XX.XX\` chuẩn (2 decimal places).

**Tại sao format strict matter:**

Fine-tuned model sẽ học **format** trước, **content** sau. Nếu mỗi example có format khác nhau ($X, $X.XX, $X.YY USD, USD X) → model confuse, output inconsistent.

Format chuẩn → consistency cao → easy parse downstream.

**Lưu ý: không có system message** trong example này. Có thể thêm:

\`\`\`python
[
    {"role": "system", "content": "You are an Amazon pricing expert."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "$129.99"}
]
\`\`\`

System message giúp model bám tone, persona. Cho task purely numerical, có thể không cần.
`
        },
        {
            title: "Bước 3 — Build JSONL files",
            lang: "python",
            before: `
**Convert items → JSONL strings → file.** Mỗi line là 1 \`{"messages": [...]}\` dict.
`,
            code: `def make_jsonl(items):
    result = ""
    for item in items:
        messages = messages_for(item)
        messages_str = json.dumps(messages)
        result += '{"messages": ' + messages_str + '}\\n'
    return result.strip()

def write_jsonl(items, filename):
    with open(filename, "w") as f:
        jsonl = make_jsonl(items)
        f.write(jsonl)

# Write 2 files: train và validation
write_jsonl(fine_tune_train, "jsonl/fine_tune_train.jsonl")
write_jsonl(fine_tune_validation, "jsonl/fine_tune_validation.jsonl")

# Preview
print(make_jsonl(train[:3]))`,
            after: `
**Output preview (3 examples):**

\`\`\`
{"messages": [{"role": "user", "content": "Estimate..."}, {"role": "assistant", "content": "$24.99"}]}
{"messages": [{"role": "user", "content": "Estimate..."}, {"role": "assistant", "content": "$199.00"}]}
{"messages": [{"role": "user", "content": "Estimate..."}, {"role": "assistant", "content": "$45.50"}]}
\`\`\`

**Validation tips:**

1. **JSONL valid:** mỗi line là **standalone JSON**. Không có trailing comma, không có wrapper array.
2. **No newline trong content:** newlines bên trong string phải escape thành \`\\\\n\`. \`json.dumps()\` auto-handle.
3. **Encoding UTF-8:** save file với utf-8, đặc biệt cho non-English content.

**Common bug:** save file với \`encoding="ascii"\` default → fail với accent characters. Always \`encoding="utf-8"\`.

**File size:**
- 100 examples × ~500 chars/example = ~50KB
- Cost upload: tiny

OpenAI giới hạn 1GB per file. Cho 800K examples → ~400MB file — fine.
`
        },
        {
            title: "Bước 4 — Upload files lên OpenAI",
            lang: "python",
            before: `
**OpenAI Files API.** Upload 2 files: train và validation. Get \`file_id\` để dùng trong fine-tune job.
`,
            code: `# Upload training file
with open("jsonl/fine_tune_train.jsonl", "rb") as f:
    train_file = openai.files.create(file=f, purpose="fine-tune")

print(f"Train file ID: {train_file.id}")

# Upload validation file
with open("jsonl/fine_tune_validation.jsonl", "rb") as f:
    validation_file = openai.files.create(file=f, purpose="fine-tune")

print(f"Validation file ID: {validation_file.id}")

# Check files via web UI:
# https://platform.openai.com/storage/files/`,
            after: `
**Output mẫu:**

\`\`\`
Train file ID: file-AbCdEf123XYZ
Validation file ID: file-XyZ789QwErTy
\`\`\`

**Mổ xẻ:**

- **\`purpose="fine-tune"\`**: OpenAI có nhiều purposes (\`assistants\`, \`batch\`, \`vision\`...). Specify \`fine-tune\` cho training files.
- **\`open(..., "rb")\`**: binary mode quan trọng. Text mode có thể corrupt JSONL.

**Validation:**

Web UI [platform.openai.com/storage/files/](https://platform.openai.com/storage/files/) show:
- File ID
- Size
- Status (uploaded → validated → ready)
- Purpose

**OpenAI validate format** trước khi accept. Nếu JSONL malformed → status "error" với reason. Common errors:
- Invalid JSON line
- Missing \`messages\` field
- Role không phải \`user\` / \`assistant\` / \`system\`
- Empty content

Pre-validate trước khi upload:

\`\`\`python
with open("jsonl/fine_tune_train.jsonl") as f:
    for i, line in enumerate(f, 1):
        try:
            json.loads(line)
        except json.JSONDecodeError as e:
            print(f"Line {i} invalid: {e}")
\`\`\`
`
        },
        {
            title: "Bước 5 — Create fine-tuning job",
            lang: "python",
            before: `
**The magic moment.** Submit job → OpenAI training cluster pickup → train model → done.

**Hyperparameters:**
- \`n_epochs=1\`: 1 pass full dataset. Day 5 keep minimal.
- \`batch_size=1\`: SGD-style update. Slow nhưng predictable.
- \`seed=42\`: reproducibility.
- \`suffix="pricer"\`: tên gợi nhớ cho custom model.
`,
            code: `openai.fine_tuning.jobs.create(
    training_file=train_file.id,
    validation_file=validation_file.id,
    model="gpt-4.1-nano-2025-04-14",       # base model để fine-tune
    seed=42,
    hyperparameters={"n_epochs": 1, "batch_size": 1},
    suffix="pricer",                         # tag thân thiện
)

# Get latest job ID
job_id = openai.fine_tuning.jobs.list(limit=1).data[0].id
print(f"Job ID: {job_id}")

# Check status
job = openai.fine_tuning.jobs.retrieve(job_id)
print(f"Status: {job.status}")
# Status: validating_files → queued → running → succeeded

# Get recent events
events = openai.fine_tuning.jobs.list_events(fine_tuning_job_id=job_id, limit=10).data
for event in events:
    print(event.message)`,
            after: `
**Status flow:**

\`\`\`
validating_files → queued → running → succeeded (hoặc failed)
\`\`\`

**Time để complete:**
- 100 examples × 1 epoch: ~30 phút
- 20K examples × 1 epoch: ~4 giờ
- Phụ thuộc queue OpenAI (peak hours longer)

**Web UI:** [platform.openai.com/finetune](https://platform.openai.com/finetune) — real-time progress, loss curves, validation metrics.

**Events log:**

\`\`\`
"Validating training file..."
"Created fine-tuning job..."
"Step 10/100: training loss=2.34"
"Step 20/100: training loss=1.89"
...
"Step 100/100: training loss=0.92"
"Fine-tuning job successfully completed"
"New model created: ft:gpt-4.1-nano:org:pricer:AbcDef"
\`\`\`

**Loss curve** giảm dần → model đang học. Nếu loss plateau cao → có thể cần more epochs hoặc LR adjustment.

**Cost tracking:** OpenAI dashboard show actual cost. Charge based on tokens trained:
- 100 examples × 200 tokens × 1 epoch = 20K training tokens
- Rate: ~$3/M tokens for nano
- Cost: $0.06

Tiny experiment. Worth $0.10 budget cho learning.
`
        },
        {
            title: "Bước 6 — Test fine-tuned model",
            lang: "python",
            before: `
**Inference với custom model.** \`fine_tuned_model_name\` từ \`fine_tuning.jobs.retrieve()\`. Use giống base model, chỉ khác tên.
`,
            code: `# Get fine-tuned model name
fine_tuned_model_name = openai.fine_tuning.jobs.retrieve(job_id).fine_tuned_model
print(fine_tuned_model_name)
# Output: ft:gpt-4.1-nano-2025-04-14:your-org::AbcDef

# Inference function (same prompt as Day 4 nhưng dùng custom model)
def test_messages_for(item):
    message = f"Estimate the price of this product. Respond with the price, no explanation\\n\\n{item.summary}"
    return [{"role": "user", "content": message}]

def gpt_4_1_nano_fine_tuned(item):
    response = openai.chat.completions.create(
        model=fine_tuned_model_name,           # custom model
        messages=test_messages_for(item),
        max_tokens=7,                           # ngắn — chỉ output "$XX.XX"
    )
    return response.choices[0].message.content

# Test 1 item
print(f"True price: \${test[0].price}")
print(f"Predicted: {gpt_4_1_nano_fine_tuned(test[0])}")
# True price: $89.99
# Predicted: $86.50

# Evaluate trên full test set
evaluate(gpt_4_1_nano_fine_tuned, test)`,
            after: `
**Output:**

\`\`\`
Fine-tuned GPT-4.1-nano (100 examples)
Average error: $96.58
Hit rate: 18.2%
\`\`\`

**TỆ HƠN BASE gpt-4.1-nano** ($76)!

**Tại sao?**

Fine-tune trên 100 examples đã làm model **lệch** khỏi general knowledge:
- Mất generalization (catastrophic forgetting)
- Format có thể bị "overfit" vào pattern train data
- Underspecify — model thấy quá ít variety

**Edward's experiments với sizes khác:**

| Size | Model | Error |
|---|---|---|
| 100 | nano fine-tune | $96 (worse) |
| 2,000 | mini fine-tune | $79 |
| 2,000 | nano fine-tune | $82 |
| **20,000** | **nano fine-tune** | **$67** |

**20K examples → $67** beat base nano ($76). Marginal improvement nhưng meaningful.

**Comparison final:**

| | Error | Cost training | Cost per inference |
|---|---|---|---|
| XGBoost Day 3 (trained 800K) | **$50** | 30 phút train | $0 |
| Fine-tuned nano (20K) | $67 | $3.42 | normal API |
| Base nano | $76 | $0 | normal API |
| Base GPT-5.1 | $52 | $0 | $$$$ |

**Insights:**

1. **XGBoost với data đầy đủ vẫn win.** Traditional ML > Fine-tuned frontier cho task này.
2. **Fine-tune work khi đủ data.** 20K example → improvement vs base.
3. **Cost-effective:** $3 training → reduce inference cost vs GPT-5.1.

**Day 5 wrap-up Tuần 6:**

Sản phẩm: pipeline đủ để train + evaluate multiple approaches:
- Curated 820K item dataset
- LLM pre-processed
- 6 baseline models (random → XGBoost)
- NN baseline
- 6 frontier zero-shot baselines
- 1 fine-tuned frontier

**Best score: XGBoost $50.**

**Tuần 7 sẽ thử fine-tune LLaMA 3.2 với QLoRA** — expect to beat all numbers above.
`
        }
    ]
});
