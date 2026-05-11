window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 7,
    day: 4,
    title: "QLoRA Training Part 2 · W&B Loss Curves · Overfitting · Best Checkpoint",
    notebooks: [],
    topics: [
        "Continue Day 3 training, monitor end-to-end",
        "Đọc loss curves: 4 patterns",
        "Train-val gap analysis",
        "Diverging vs healthy training",
        "Best checkpoint selection (KHÔNG phải final)",
        "Save adapter + push lên HF Hub"
    ],
    summary: `
## 1. Day 4 — Training monitoring + analysis

Day 3 đã start training. Day 4:
1. Monitor W&B dashboard end-to-end
2. Đọc loss curves để identify issues
3. Pick best checkpoint (không phải final)
4. Push final adapter lên Hub

## 2. 4 loss curve patterns

\`\`\`
Pattern 1: HEALTHY
train ━━━━━━━┓
              ┗━━━━━━━━━ (decrease smooth)
val   ━━━━━━━┓
              ┗━━━━━━━━━ (parallel với train, gap nhỏ)

Pattern 2: OVERFITTING
train ━━━━━━━┓
              ┗━━━━━━━━━ (keep decreasing)
val   ━━━━━━┓
             ┗━━━┓
                  ━━━━━━ (đáy ở giữa, sau đó tăng)

Pattern 3: UNDERFITTING
train ━━━━━━━━━━━━━━━━━ (flat high)
val   ━━━━━━━━━━━━━━━━━ (flat high)

Pattern 4: DIVERGING
train ━━━━━━┓       ┏━━━━ (xuống rồi explode → NaN)
val   ━━━━━━━━━━━━━━━━━ (random)
\`\`\`

## 3. Diagnostic table

| Pattern | Nguyên nhân | Fix |
|---|---|---|
| **Healthy** | Configuration tốt | Continue. Stop khi đủ steps |
| **Overfitting** | Data nhỏ, train quá lâu | Early stop, giảm epoch, thêm dropout, more data |
| **Underfitting** | Capacity insufficient, LR thấp | Tăng rank LoRA, tăng LR, train lâu hơn |
| **Diverging** | LR quá cao, gradient explode | Giảm LR, tăng grad clipping, kiểm tra data weird |

## 4. Train-Val gap

Gap = val_loss - train_loss (luôn ≥ 0 cho model healthy).

| Gap | Interpretation |
|---|---|
| <10% | Excellent generalization |
| 10-30% | Slight overfit, acceptable |
| >50% | Severe overfit. Stop, regularize |
| 0 hoặc negative | Bug — data leakage |

## 5. Best checkpoint vs final

Khi training xong, có **nhiều checkpoints** (save mỗi 5000 steps). Naïve: dùng final. **Tốt hơn: dùng checkpoint với val_loss thấp nhất.**

\`\`\`
Step 5000:  val_loss = 0.85
Step 10000: val_loss = 0.72
Step 15000: val_loss = 0.65   ← best
Step 20000: val_loss = 0.68
Step 25000: val_loss = 0.74   (overfitting)
Step 50000: val_loss = 0.81   (final - tệ hơn)
\`\`\`

Step 15000 = best. Final tệ hơn vì overfitting.

\`load_best_model_at_end=True\` trong TrainingArguments tự động load best checkpoint dựa trên \`metric_for_best_model="eval_loss"\`.

## 6. Push adapter lên Hub

Sau training, adapter (~30MB) push lên Hub:

\`\`\`
ed-donner/pricer  (LoRA adapter, KHÔNG phải full model)
\`\`\`

Để inference Day 5:
1. Load base LLaMA 3.2-3B (~2GB qua 4-bit)
2. Apply adapter from \`ed-donner/pricer\`
3. Inference

**Adapter portable** — share dễ, không cần re-upload full model.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho training run:** Coi như theo dõi học sinh học. Train loss = điểm bài tập về nhà. Val loss = điểm kiểm tra ngẫu nhiên. Học sinh có thể làm tốt bài tập (train loss thấp) nhưng kém kiểm tra (val loss cao) → overfitting (học vẹt)."
        },
        {
            type: "warn",
            text: "**Đừng để 1 run chạy mà không quan sát.** Kiểm tra W&B sau 30-60 phút đầu để spot diverging hay plateau. Cancel + restart với HP đúng tiết kiệm hơn chạy 8 giờ."
        }
    ],
    keyPoints: [
        "**Watch val loss, không phải train loss.** Train loss giảm hoài cũng không có ý nghĩa nếu val loss tăng.",
        "**Gap train-val = overfitting metric tốt nhất.** Quy tắc thực dụng hơn 'train loss thấp = tốt'.",
        "**Loss spike không nhất thiết bug.** Stochastic gradient có natural variance.",
        "**Best checkpoint ≠ final checkpoint.** Save thường xuyên + load best at end là default tốt.",
        "**Early stopping save GPU cost lớn.** Dataset to (vài giờ), early stop ở 60% steps save $5-10/run.",
        "**Compare runs side-by-side trong W&B.** Don't remember manually."
    ],
    code: [
        {
            title: "Bước 1 — Monitor W&B realtime",
            lang: "python",
            before: `
**Day 4 typically:** không code gì mới, chỉ watch W&B dashboard. Trainer chạy nền từ Day 3.

**4 metrics chính track:**
- \`train/loss\`: training loss (smoothed)
- \`eval/loss\`: validation loss (every 5K steps)
- \`train/learning_rate\`: LR schedule
- \`train/grad_norm\`: gradient magnitude
`,
            code: `# Day 4 không có new code. Mở W&B dashboard:
# https://wandb.ai/your-username/pricer

# Interactive monitoring - không cần code

# Có thể inspect locally nếu cần:
import wandb
api = wandb.Api()
run = api.run("your-username/pricer/RUN_ID")

# Get loss history
history = run.history(samples=1000)
print(history[['_step', 'train/loss', 'eval/loss']].tail(20))`,
            after: `
**Healthy run mẫu (theo Edward's experiment):**

\`\`\`
Step    Train Loss    Eval Loss
1000    4.823         5.012
5000    2.341         2.512
10000   1.823         2.041
15000   1.521         1.821
20000   1.342         1.712
30000   1.156         1.643
40000   1.024         1.621
50000   0.952         1.612    ← final
\`\`\`

**Quan sát:**

- **Train loss giảm dần** 4.8 → 0.95
- **Eval loss giảm chậm hơn** 5.0 → 1.6 (gap tăng theo time = đang overfit nhẹ)
- **Eval plateaus** ở ~1.6 sau step 30K — diminishing returns
- **Best checkpoint:** ~step 30K-40K (eval lowest)

**Action items based on curves:**

1. **Loss healthy**: continue
2. **Gap widening** sau step 30K → có thể stop sớm (train tới 40K thay vì 50K)
3. **No NaN/inf**: stable
4. **GPU 95%+ utilization**: efficient

**Bad signs to watch:**

- Loss tăng đột ngột (1 spike OK, nhiều liên tiếp bad)
- NaN trong train_loss (LR quá cao, gradient explode)
- Val loss tăng > 30% so với best (overfitting)
- GPU < 50% (bottleneck data loading hoặc CPU)
`
        },
        {
            title: "Bước 2 — Stop training + select best checkpoint",
            lang: "python",
            before: `
**Khi training xong** (hoặc bạn quyết định stop sớm), pick best checkpoint từ \`./outputs/\` folder.

Pattern: \`load_best_model_at_end=True\` trong SFTConfig tự động load. Nhưng có thể manually chọn nếu cần.
`,
            code: `import os
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

# List checkpoints
checkpoints = sorted([d for d in os.listdir("./outputs/pricer-*") if d.startswith("checkpoint-")])
print("Available checkpoints:", checkpoints)
# ['checkpoint-5000', 'checkpoint-10000', ..., 'checkpoint-50000']

# Load specific checkpoint với best eval loss (giả sử 30K)
BEST_CHECKPOINT = "./outputs/pricer-2025-11-20-XX-XX-XX/checkpoint-30000"

# Reload base model
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

base = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B",
    quantization_config=bnb_config,
    device_map="auto",
)

# Load LoRA adapter từ best checkpoint
model = PeftModel.from_pretrained(base, BEST_CHECKPOINT)

# Verify
print(f"Loaded checkpoint: {BEST_CHECKPOINT}")
print(f"Total params: {sum(p.numel() for p in model.parameters()):,}")`,
            after: `
**Mổ xẻ:**

**Manual checkpoint selection cần khi:**
- Want specific step (not best)
- Multiple metrics — eval_loss best ≠ MAE best
- Experimental: try different checkpoints, eval downstream

**Auto load best (recommended):**

\`\`\`python
trainer = SFTTrainer(
    ...,
    args=SFTConfig(
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        ...
    )
)
\`\`\`

Sau \`trainer.train()\`, \`trainer.model\` = best checkpoint auto-loaded.

**Save checkpoint to upload:**

\`\`\`python
trainer.save_model("./final_adapter")
# Hoặc push trực tiếp lên Hub
trainer.push_to_hub()
\`\`\`

**Folder structure adapter:**

\`\`\`
./final_adapter/
├── adapter_config.json     # LoRA config (rank, alpha, target_modules)
├── adapter_model.safetensors # 30MB - LoRA weights
└── tokenizer files          # for inference
\`\`\`

**Trong production:** push lên HF Hub → versioned, share dễ.
`
        },
        {
            title: "Bước 3 — Push final adapter lên Hub",
            lang: "python",
            before: `
**Last step Day 4.** Push adapter lên Hub để Day 5 load và evaluate.

**Note:** push **adapter** (~30MB), không phải base model (~6GB). Day 5 sẽ load base + adapter separately.
`,
            code: `# Push lên Hub
HUB_MODEL_ID = "ed-donner/pricer"     # tên trên Hub

trainer.push_to_hub(HUB_MODEL_ID, private=False)

# Hoặc manual với PeftModel
model.push_to_hub(HUB_MODEL_ID)

# Verify trên Hub
# https://huggingface.co/ed-donner/pricer

# Tokenizer cũng push (cho convenience)
tokenizer.push_to_hub(HUB_MODEL_ID)`,
            after: `
**Mổ xẻ Hub structure:**

\`\`\`
huggingface.co/ed-donner/pricer
├── README.md                  # model card (auto-generated)
├── adapter_config.json        # LoRA config
├── adapter_model.safetensors  # 30MB weights
├── tokenizer.json
├── tokenizer_config.json
└── special_tokens_map.json
\`\`\`

**Model card** thường có:

\`\`\`markdown
# Pricer

Fine-tuned LLaMA 3.2-3B with QLoRA on Amazon products dataset.

**Base model:** meta-llama/Llama-3.2-3B
**Adapter type:** LoRA (rank=32, alpha=64)
**Training data:** ed-donner/items_prompts_full (820K examples)
**Training time:** ~7 hours on A100 40GB

## Usage

\`\`\`python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-3B")
model = PeftModel.from_pretrained(base, "ed-donner/pricer")
tokenizer = AutoTokenizer.from_pretrained("ed-donner/pricer")
\`\`\`
\`\`\`

**Production note:** add usage example, license info, eval metrics → easier for users to adopt.

**Day 4 complete.** Adapter trên Hub. Day 5 sẽ load và evaluate trên test set.
`
        }
    ]
});
