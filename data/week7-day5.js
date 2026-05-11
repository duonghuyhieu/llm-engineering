window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 7,
    day: 5,
    title: "Inference fine-tuned model · Cross-Entropy Loss · So sánh full results",
    notebooks: [],
    topics: [
        "Load base + adapter for inference",
        "Extract price từ generation output",
        "Cross-Entropy Loss — toán học LM training",
        "Tại sao LM khó cho regression",
        "Eval fine-tuned vs XGBoost vs Frontier zero-shot",
        "Production deployment options"
    ],
    summary: `
## 1. Day 5 — Eval cuối Tuần 7

Sau Day 4 push adapter lên Hub. Day 5:
1. Load base + adapter cho inference
2. Run inference trên 10K test set
3. Compute MAE, RMSE, hit rate
4. Compare với tất cả baselines (Day 3 W6 XGBoost, Day 4 W6 Frontier)

## 2. 2 patterns inference

**Pattern 1: Runtime merge (development)**

\`\`\`python
base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-3B", ...)
model = PeftModel.from_pretrained(base, "ed-donner/pricer")
# Generate normally
\`\`\`

- Pros: Linh hoạt, swap adapter dễ
- Cons: Mỗi forward pass + 5-10% latency

**Pattern 2: Merge to base (production)**

\`\`\`python
merged = model.merge_and_unload()
merged.save_pretrained("./merged_model")    # ~6GB
\`\`\`

- Pros: No runtime overhead
- Cons: Mất modularity, file lớn

Production thường merge cho deploy. Pattern 1 cho dev/A-B test.

## 3. Cross-Entropy Loss — toán học LM training

Loss của LLM training là **cross-entropy** giữa predicted distribution và true next-token:

\`\`\`
For each token position t:
    true_token_id = ...           (vd 17699 = "off")
    logits[t] = model output      (vector vocab size 128K)
    probs[t] = softmax(logits[t])
    loss[t] = -log(probs[t][true_token_id])
\`\`\`

Total loss = mean across all token positions trong completion.

**Intuition:** cross-entropy = "model surprise" về token đúng. Predict đúng với high prob → -log(0.99) ≈ 0.01. Sai → -log(0.0001) ≈ 9.

## 4. Tại sao LM 'khó' cho regression

LM được train với **cross-entropy on discrete tokens**, không phải MSE on continuous numbers.

Hệ quả:

- Token "25" và "26" → cross-entropy không hiểu "gần nhau" về số học
- Token "25" và "1000" → cũng "khác nhau" trên vocab, dù distance số học khác xa
- LM không có inductive bias về numerical proximity

**Workaround Day 2:**
- Output digit-by-digit format: \`"399.00"\`
- Round prices để giảm vocab effective
- Custom regression head (advanced, ngoài scope)

## 5. Final results Tuần 7

| Method | MAE | Note |
|---|---|---|
| Random | $329 | Floor |
| Mean | $99 | |
| XGBoost (W6 D3) | $50 | Best traditional |
| Human baseline | $70 | Ceiling? |
| GPT-4.1-nano zero-shot | $76 | |
| Claude Opus 4.5 zero-shot | $66 | |
| GPT-5.1 zero-shot (reasoning high) | $52 | Top frontier |
| **Fine-tuned LLaMA 3.2-3B QLoRA** | **$46** | 🏆 Beat all |

**LLaMA 3.2-3B fine-tuned beat XGBoost** ($46 vs $50) và **GPT-5.1** ($46 vs $52).

**Big wins:**

1. **Open-source beat frontier:** 3B open-source > GPT-5.1 closed-source cho task này
2. **One-time training, free inference:** vs frontier API mỗi call tốn $$$
3. **Privacy:** model chạy local, data không rời server

**Cost economics:**

- Training: ~$10 trên A100 (one-time)
- Inference: $0 (self-host)
- vs GPT-5.1: ~$30 per 10K queries

**Break-even:** ~3000 queries (one month for moderate traffic).

## 6. Production deployment

Sau Tuần 7 có working fine-tuned model. Tuần 8 sẽ:
- Deploy model lên Modal (serverless GPU)
- Build Agentic system với multiple LLMs
- Production-grade pipeline
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho fine-tuning ROI:** Coi như đào giếng vs mua nước đóng chai. Fine-tune = đào giếng (cost upfront cao, free sau đó). API frontier = mua nước (no upfront, pay-per-use). Break-even theo consumption hàng ngày."
        },
        {
            type: "warn",
            text: "**LLaMA license có ràng buộc.** \\\"Acceptable Use Policy\\\" của Meta cấm vài use case. Đọc trước khi commercial deploy. Apache 2.0 (Qwen, Phi, GPT-OSS) sạch hơn."
        }
    ],
    keyPoints: [
        "**Merge adapter trước deploy production.** Pattern \`merge_and_unload()\` cho latency thấp.",
        "**Cross-entropy + token distance ≠ semantic distance.** Hệ quả: regression qua decoder LLM có limitation.",
        "**Open-source 3B fine-tuned có thể beat frontier 1T+.** Task niche, fine-tuning là 'great equalizer'.",
        "**Cost economics flip khi scale.** $0/inference self-host vs $0.001+/inference API. Threshold ~50K query/month.",
        "**Privacy là driver mạnh cho fine-tuning.** Healthcare, legal, finance — không gửi cloud được.",
        "**Đừng fine-tune nếu chưa baseline.** Quy tắc xuyên Tuần 6-7: baseline → đo lift → decide invest."
    ],
    code: [
        {
            title: "Bước 1 — Setup inference với base + adapter",
            lang: "python",
            before: `
**Day 5 trên Colab.** Load LLaMA 3.2-3B base (4-bit) + LoRA adapter từ Hub. Total ~2GB VRAM — fit T4 thoải mái cho inference.
`,
            code: `import os
import torch
import re
from dotenv import load_dotenv
from huggingface_hub import login
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel
from tqdm.notebook import tqdm
from pricer.items import Item
from pricer.evaluator import evaluate

load_dotenv(override=True)
login(os.environ['HF_TOKEN'])

BASE_MODEL = "meta-llama/Llama-3.2-3B"
FINETUNED_MODEL = "ed-donner/pricer"

# Load 4-bit base
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
)

# Apply LoRA adapter từ Hub
model = PeftModel.from_pretrained(base_model, FINETUNED_MODEL)
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
tokenizer.pad_token = tokenizer.eos_token

print("Model loaded!")
print(f"Total params: {sum(p.numel() for p in model.parameters()):,}")`,
            after: `
**Mổ xẻ:**

**\`PeftModel.from_pretrained(base, adapter_id)\`** workflow:
1. Download adapter weights từ Hub (~30MB)
2. Apply adapter layers on top of base
3. Forward pass: \`output = base_forward(x) + adapter_delta(x)\`

**Memory profile sau load:**

- Base model 4-bit: ~2GB
- LoRA adapter FP16: ~30MB
- KV cache (max_seq_length=128): ~100MB
- **Total: ~2.1GB**

T4 16GB: tons of headroom. Có thể batch inference 32+ items cùng lúc.

**Alternative: merge cho production**

\`\`\`python
# Pattern 2: merge — no adapter at runtime
merged = model.merge_and_unload()
merged.save_pretrained("./merged")
# Sau đó load merged như base model — không cần peft library
\`\`\`

Trade-off:
- Merged: faster inference (no adapter overhead) nhưng file ~6GB
- Adapter: 30MB, swap adapters dễ, slightly slower forward
`
        },
        {
            title: "Bước 2 — Inference function: extract price từ generation",
            lang: "python",
            before: `
**Generate price.** Pattern:

1. Build prompt từ test item
2. Tokenize, send to GPU
3. \`model.generate(max_new_tokens=5)\` — chỉ cần vài tokens
4. Decode + parse price từ output

**\`max_new_tokens=5\`** quan trọng — tránh model verbose, focus output number.
`,
            code: `def extract_price(text):
    """Extract first number sau 'Price is $' marker."""
    if "Price is $" in text:
        text = text.split("Price is $")[-1]
    match = re.search(r"[\\$]?(\\d+(?:\\.\\d+)?)", text)
    if match:
        return float(match.group(1))
    return 0.0

def llama_pricer(item):
    # Use test_prompt() which strips ground truth
    prompt = item.test_prompt()    # "What does this cost?...Price is $"
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    # Greedy decoding for deterministic price
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=5,
            do_sample=False,                    # greedy = deterministic
            pad_token_id=tokenizer.eos_token_id,
        )

    # Decode chỉ tokens mới sinh
    new_tokens = outputs[0][inputs.input_ids.shape[1]:]
    response = tokenizer.decode(new_tokens, skip_special_tokens=True)

    return extract_price(response)

# Test 1 item
print(f"True price: \${test[0].price}")
print(f"Predicted: \${llama_pricer(test[0]):.2f}")
# True price: $89.99
# Predicted: $87.00`,
            after: `
**Mổ xẻ:**

**\`item.test_prompt()\`** trong Item class:

\`\`\`python
def test_prompt(self) -> str:
    return self.prompt.split(PREFIX)[0] + PREFIX
\`\`\`

Strip ground truth completion, keep prompt ending in "Price is $". Model sẽ generate tiếp theo.

**\`do_sample=False\`**: greedy decoding. Always pick highest probability token. Deterministic — cùng input → cùng output. **Critical cho eval reproducibility.**

**\`max_new_tokens=5\`**: chỉ generate 5 tokens. Output thường là "399.00" = 3-4 tokens. 5 đủ buffer + EOS.

**Parse trick:**

LLM có thể output:
- \`"399.00"\` (ideal)
- \`"399.00\\n"\` (extra newline)
- \`"$399.00"\` (extra $ dù prompt đã có)
- \`"399.00 USD"\` (extra unit)

\`extract_price()\` regex tolerant cho variations. Production: log items where parsing fail để debug.

**Latency per inference:**
- T4 với 4-bit + batch=1: ~200ms
- A100: ~80ms

Compare:
- API call GPT-5.1: ~500-2000ms (network + queue)
- API call gpt-4.1-nano: ~200ms
- **Self-host LLaMA: ~200ms + $0 cost**

Win-win cho high-volume.
`
        },
        {
            title: "Bước 3 — Evaluate trên test set 10K items",
            lang: "python",
            before: `
**Final eval.** Run \`llama_pricer\` qua \`evaluate()\` framework — same pattern as Day 3-4 Tuần 6.

Eval 10K items: ~30 phút trên T4, ~15 phút trên A100. Có thể batch inference để tăng tốc 5-10× nhưng pattern phức tạp hơn.
`,
            code: `# Eval - dùng evaluator framework
evaluate(llama_pricer, test, size=250)   # subset 250 cho fast iteration

# Full eval 10K:
# evaluate(llama_pricer, test)`,
            after: `
**Output mẫu (250 items subset):**

\`\`\`
LLaMA 3.2-3B Fine-tuned
Total items: 250
Average error: $46.32
RMSE: $58.71
Hit rate (within $40 or 20%): 33.6%
\`\`\`

**Quan sát:**

- **MAE $46** — best score Tuần 6-7 so với mọi baseline
- **Hit rate 33.6%** — 1/3 predictions trong "good" range
- **RMSE $58** — không quá nhiều outlier

**Full 10K eval typically gives:** MAE $46-50, similar pattern.

**Compare all approaches:**

| Method | MAE | Cost | Privacy |
|---|---|---|---|
| Mean baseline | $99 | $0 | ✓ |
| Linear + BoW | $95 | $0 | ✓ |
| **XGBoost** | **$50** | $0 | ✓ |
| Human (50 items) | $70 | -- | ✓ |
| gpt-4.1-nano zero-shot | $76 | $0.50/10K | ✗ |
| Claude Opus 4.5 zero-shot | $66 | $15/10K | ✗ |
| GPT-5.1 zero-shot (reasoning high) | $52 | $30/10K | ✗ |
| Fine-tuned gpt-4.1-nano (20K) | $67 | $3 train + $0.50/10K | ✗ |
| **LLaMA 3.2-3B QLoRA fine-tuned** | **$46** | **$10 train + $0 inference** | **✓** |

**🏆 LLaMA fine-tuned wins on:**
1. **Accuracy** ($46 < $50 XGBoost, $52 GPT-5.1)
2. **Cost** ($0 inference)
3. **Privacy** (self-host)

**Marginal:** $4 better than XGBoost. Đáng đầu tư extra time train? Phụ thuộc use case:
- High volume: yes — accuracy + cost both win
- Low volume: maybe — XGBoost simpler to maintain
- Privacy critical: yes — self-host essential
`
        },
        {
            title: "Bước 4 — Production patterns: serving fine-tuned model",
            lang: "python",
            before: `
**Sau eval thành công, deploy lên production.** Có nhiều options:
`,
            code: `# Option 1: Local FastAPI server
from fastapi import FastAPI
from pydantic import BaseModel

class PriceRequest(BaseModel):
    description: str

app = FastAPI()

# Load model ONCE on startup
@app.on_event("startup")
async def startup():
    global model, tokenizer
    base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, ...)
    model = PeftModel.from_pretrained(base, FINETUNED_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

@app.post("/predict")
async def predict(req: PriceRequest):
    item = Item(summary=req.description, ...)
    price = llama_pricer(item)
    return {"predicted_price": price}

# Run: uvicorn app:app --host 0.0.0.0 --port 8000
# Cost: GPU rental ~$0.5-3/hour

# Option 2: Serverless với Modal (Tuần 8 sẽ học)
# Option 3: HuggingFace Inference Endpoints (managed, paid)
# Option 4: SageMaker / Vertex AI (enterprise, expensive)`,
            after: `
**Production options comparison:**

| Option | Latency | Cost | Setup |
|---|---|---|---|
| **Local FastAPI + dedicated GPU** | Fast (<200ms) | $$$ always-on ($300+/month) | Hard (need DevOps) |
| **Modal serverless** | Cold start 5-10s, warm fast | $ pay-per-second | Easy (Tuần 8) |
| **HF Inference Endpoints** | Fast | $$ ~$0.5/hour | Easy (managed) |
| **vLLM / TGI server** | Very fast (batching) | $$ GPU rental | Medium |

**Day 5 wrap-up Tuần 7:**

Sản phẩm sau 7 tuần:
- ✅ Curated 820K Amazon dataset
- ✅ LLM pre-processed (Day 2 W6)
- ✅ Traditional ML baselines (Day 3 W6)
- ✅ Neural Network (Day 4 W6)
- ✅ Frontier zero-shot eval (Day 4 W6)
- ✅ Fine-tuned frontier (Day 5 W6)
- ✅ **Fine-tuned LLaMA 3.2-3B QLoRA — $46 MAE, beat all** 🏆

**Tuần 8 sẽ:**
- Deploy LLaMA fine-tuned lên Modal serverless
- Build **Agentic AI system** với multiple specialist agents
- Combine với RAG + Frontier + Fine-tuned
- Production-grade pipeline với monitoring

Tuần 7 là **technical capstone** — kỹ thuật fine-tune deep. Tuần 8 là **product capstone** — ráp tất cả thành sản phẩm.
`
        }
    ]
});
