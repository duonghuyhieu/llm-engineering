window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 8,
    day: 1,
    title: "Modal serverless GPU · Deploy LLaMA fine-tuned · SpecialistAgent",
    notebooks: ["week8/day1.ipynb"],
    topics: [
        "Capstone Tuần 8: The Price Is Right Agentic AI",
        "Modal.com — serverless GPU platform",
        "Hello world Modal: local function → cloud execution",
        "Deploy LLaMA 3.2-3B fine-tuned (Tuần 7 adapter) lên Modal",
        "Ephemeral apps vs Deployed apps",
        "SpecialistAgent class wrap Modal endpoint"
    ],
    summary: `
## 1. Capstone Tuần 8: The Price Is Right

Sau 7 tuần build từng component, Tuần 8 ráp tất cả thành **Agentic AI sản phẩm hoàn chỉnh**:

\`\`\`
Internet RSS feeds
   ↓ ScannerAgent
Detected deals
   ↓ FrontierAgent (RAG + GPT-5)
   ↓ SpecialistAgent (LLaMA fine-tuned)
   ↓ EnsembleAgent
Estimated true value
   ↓ if discount > threshold
MessagingAgent → Pushover notification
\`\`\`

**Coordinator:** AutonomousPlannerAgent (GPT-5) orchestrate tất cả qua tool calling.

## 2. Order of play Tuần 8

| Day | Topic |
|---|---|
| 1 | Modal.com + SpecialistAgent (deploy LLaMA Tuần 7) |
| 2 | RAG, FrontierAgent, EnsembleAgent |
| 3 | ScannerAgent + MessengerAgent |
| 4 | AutonomousPlannerAgent + DealAgentFramework |
| 5 | Final UI + capstone |

## 3. Modal.com — serverless GPU

**Vấn đề traditional:** muốn deploy LLaMA 3B → cần GPU rental ($0.5-3/h × 24h × 30 = $300-2000/month).

**Modal solution:** **pay-per-second**, auto scale-to-zero khi idle.

- Cold start: ~30s-2 phút (load model)
- Warm: 200ms inference
- Cost: chỉ trả khi chạy

**Idiomatic Python API:**

\`\`\`python
@app.function(image=image, gpu="A10G")
def my_function(x):
    # Code chạy trên cloud GPU
    return result

# Local code
result = my_function.remote(x)   # Magic: call cloud function
\`\`\`

\`@app.function\` decorator + \`.remote()\` call = code chạy trên cloud.

## 4. SpecialistAgent

Wrap Modal endpoint thành Python class với clean API:

\`\`\`python
agent = SpecialistAgent()
price = agent.price("iPhone 10")   # → $750
\`\`\`

Bên dưới:
1. Preprocess input với Llama 3.2 (qua LiteLLM)
2. Call Modal-deployed LLaMA pricer
3. Parse output → price float

**Đây là pattern cho mọi specialist agent:** wrap complex pipeline thành simple Python class.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho serverless GPU:** Coi như Uber. Không sở hữu xe (GPU), gọi khi cần, trả tiền theo trip (per-second). Khi không cần (idle), không tốn gì. Trade-off: phải đợi xe đến (cold start)."
        },
        {
            type: "warn",
            text: "**Cẩn thận chi phí runaway.** Bug làm function chạy infinite loop trên GPU = bill khổng lồ. Set \`timeout\`, monitor billing alert. Modal có cap nhưng đặt safety net riêng vẫn đáng."
        }
    ],
    keyPoints: [
        "**Agent ≠ chatbot.** Agent có autonomy + tools + memory + goal — 4 đặc tính cùng có.",
        "**Serverless GPU thay đổi economics.** Pay-per-second thay vì always-on. Phù hợp 90% use case.",
        "**Cold start là biggest enemy.** 30s-5 phút wait deal-breaker cho real-time UX. Mitigate: warm pool, persistent volume.",
        "**Secrets manager bắt buộc.** HF token, API keys không hardcode. Modal có built-in Secrets dashboard.",
        "**Build agent simplest first.** Single tool, single LLM call. Add complexity từng bước.",
        "**\`@app.function\` decorator** là magic của Modal — wrap Python function thành cloud function."
    ],
    code: [
        {
            title: "Bước 1 — Setup Modal account + tokens",
            lang: "python",
            before: `
**Modal account setup.**

1. Visit modal.com, sign up account
2. Settings → API Tokens → New Token
3. Modal show command \`modal token set --token-id ak-... --token-secret as-...\`
4. Run với UV: \`uv run modal token set --token-id ak-... --token-secret as-...\`

Hoặc add directly vào \`.env\`:
\`\`\`
MODAL_TOKEN_ID=ak-...
MODAL_TOKEN_SECRET=as-...
\`\`\`
`,
            code: `import os
import modal
from dotenv import load_dotenv
load_dotenv(override=True)

# Check encoding (Windows users)
import locale
print(locale.getpreferredencoding())  # Should print 'UTF-8'
os.environ["PYTHONIOENCODING"] = "utf-8"

# Tokens verified - không cần code, đã set qua CLI/env
# Verify connection: chạy 1 ephemeral function ở step sau`,
            after: `
**Setup chi tiết HuggingFace secret trên Modal:**

1. modal.com → Dashboard → **Secrets** (left nav)
2. Click "Create new secret" → Pick "Hugging Face"
3. Name: \`huggingface-secret\` (exact name, code reference)
4. Key: \`HF_TOKEN\`, Value: \`hf_...\` (your token)

**Tại sao secrets quan trọng:**

LLaMA gated → need HF token để pull weights khi deploy. **Không hardcode** trong code (security + push lên Hub vô tình expose).

Modal Secrets:
- Encrypted at rest
- Available trong runtime env (env vars)
- Audit log
- Rotate dễ

**Pattern reference trong code:**

\`\`\`python
@app.function(secrets=[modal.Secret.from_name("huggingface-secret")])
def my_function():
    hf_token = os.environ["HF_TOKEN"]   # auto-injected
    ...
\`\`\`
`
        },
        {
            title: "Bước 2 — Hello world Modal",
            lang: "python",
            before: `
**First Modal app.** \`hello.py\` định nghĩa app với 2 functions: local + remote. Test syntax + verify tokens work.
`,
            code: `# In hello.py:
import modal

app = modal.App("hello")
image = modal.Image.debian_slim().pip_install("requests")

@app.function(image=image)
def hello():
    import requests
    response = requests.get("https://ipinfo.io/json")
    return response.json()

@app.function(image=image, region="eu")
def hello_europe():
    import requests
    response = requests.get("https://ipinfo.io/json")
    return response.json()

# In notebook:
from hello import app, hello, hello_europe

# Run locally - just call .local()
with app.run():
    reply = hello.local()
print(reply)
# {'ip': 'YOUR_IP', ...} - your IP

# Run remote - call .remote()
with app.run():
    reply = hello.remote()
print(reply)
# {'ip': 'MODAL_CLOUD_IP', ...} - Modal's cloud IP, different from yours!`,
            after: `
**Magic của \`.remote()\`:**

1. Modal serialize function args
2. Upload to Modal cloud
3. Provision container (~5-10s cold start)
4. Execute function
5. Return result

**\`with app.run():\`** ephemeral context — Modal create temporary app cho session. Auto-cleanup khi exit.

**Compare:**

| Call | Where | Speed |
|---|---|---|
| \`hello.local()\` | Local Python | Fast |
| \`hello.remote()\` | Modal cloud | +5-10s cold start |
| \`hello_europe.remote()\` | Modal cloud EU region | +5-10s |

**Region-aware:** \`region="eu"\` chạy ở EU datacenter. Hữu ích cho GDPR compliance, latency to EU users.

**Image:** \`modal.Image.debian_slim().pip_install("requests")\` define container — Debian base + Python deps. Auto-build first time, cached after.
`
        },
        {
            title: "Bước 3 — Pricer ephemeral app: LLaMA 3.2-3B inference",
            lang: "python",
            before: `
**Real app.** Deploy LLaMA 3.2-3B (Tuần 7 fine-tuned) lên Modal cho inference.

\`pricer_ephemeral.py\` define app với GPU function. Image bao gồm transformers, peft, bitsandbytes.
`,
            code: `# In pricer_ephemeral.py:
import modal

app = modal.App("pricer-ephemeral")
image = (
    modal.Image.debian_slim()
    .pip_install("torch", "transformers", "peft", "bitsandbytes", "accelerate")
)

@app.function(
    image=image,
    gpu="A10G",                                          # ~$1.30/hour
    secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=1800,                                         # 30 phút max
)
def price(description: str) -> float:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import PeftModel
    import re

    # Load base + adapter (cold start)
    bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                              bnb_4bit_compute_dtype=torch.bfloat16)
    base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-3B",
                                                 quantization_config=bnb, device_map="auto")
    model = PeftModel.from_pretrained(base, "ed-donner/pricer")
    tok = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-3B")

    # Inference
    prompt = f"What does this cost to the nearest dollar?\\n\\n{description}\\n\\nPrice is $"
    inputs = tok(prompt, return_tensors="pt").to("cuda")
    outputs = model.generate(**inputs, max_new_tokens=5, do_sample=False)
    response = tok.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
    return float(re.search(r"\\d+\\.?\\d*", response).group())


# In notebook:
from pricer_ephemeral import app, price

with modal.enable_output():
    with app.run():
        result = price.remote("Quadcast HyperX condenser mic, connects via usb-c to your computer for crystal clear audio")
print(result)
# Output: $99.0 (or similar)`,
            after: `
**Mổ xẻ:**

**\`gpu="A10G"\`**: GPU instance. A10G = ~$1.30/hour, balance cost-performance cho 3B model. Other options: T4 ($0.59/h), A100 ($3.30/h), H100 ($5+/h).

**\`secrets=[modal.Secret.from_name("huggingface-secret")]\`**: HF token available in runtime as \`os.environ["HF_TOKEN"]\`. Library transformers auto-pick up.

**\`timeout=1800\`**: max execution time. Default 5 phút. Cold start + inference cần buffer.

**Cold start breakdown:**

1. Provision container: 5-10s
2. Pull image: 5-30s (first time, then cached)
3. Download model 4-bit (~2GB) + adapter (~30MB) từ HF: 1-2 phút
4. Load model vào VRAM: 30s-1 phút
5. Inference: 100-500ms

**Total first call: 2-5 phút.** Sau đó warm inference: <500ms.

**Day 1 deploy** này hoạt động nhưng slow. Bước 4 sẽ improve.
`
        },
        {
            title: "Bước 4 — Deployed app: persistent service",
            lang: "python",
            before: `
**Ephemeral vs Deployed:**

| | Ephemeral | Deployed |
|---|---|---|
| Lifetime | Khi notebook running | Always available (until deleted) |
| Cold start | Mỗi run | Once, then warm pool |
| Use case | Dev, testing | Production |

\`pricer_service.py\` deploys permanent app. Deploy command: \`uv run modal deploy -m pricer_service\`.
`,
            code: `# Deploy command (run in terminal hoặc Jupyter !):
!uv run modal deploy -m pricer_service

# Sau khi deploy thành công, get function handle từ deployed app:
import modal
pricer = modal.Function.from_name("pricer-service", "price")

# Call deployed function (no \`with app.run()\` needed)
text = "Quadcast HyperX condenser mic..."
result = pricer.remote(text)
print(result)`,
            after: `
**Deployed app workflow:**

1. \`modal deploy\` upload code lên Modal cluster
2. Modal create permanent app với name \`pricer-service\`
3. App available qua \`modal.Function.from_name("pricer-service", "price")\`
4. Multiple notebooks / scripts có thể call cùng app

**Improvements với \`pricer_service2.py\` (class-based):**

\`\`\`python
@app.cls(image=image, gpu="A10G", min_containers=1, scaledown_window=120)
class Pricer:
    @modal.enter()
    def setup(self):
        # Load model ONCE per container, not per request
        self.model = ...

    @modal.method()
    def price(self, description: str) -> float:
        # Use self.model for inference
        return ...
\`\`\`

**Key improvements:**

- **\`@modal.enter()\`**: load model on container startup, not per request → faster inference
- **\`min_containers=1\`**: keep 1 container warm always → no cold start ever (but costs $$)
- **\`scaledown_window=120\`**: idle timeout 2 phút before scale down

**Cost trade-off:**

- \`min_containers=0\`: $0 idle, 2-3 min cold start
- \`min_containers=1\`: ~$30/month for A10G always-on, 0 cold start

**Pattern \`update_autoscaler\`:**

\`\`\`python
import modal
Pricer = modal.Cls.from_name("pricer-service", "Pricer")
pricer = Pricer()
pricer.update_autoscaler(scaledown_window=1200)   # warm 20 phút
\`\`\`

Adjust theo traffic pattern.
`
        },
        {
            title: "Bước 5 — SpecialistAgent class wrap",
            lang: "python",
            before: `
**Clean abstraction.** Wrap Modal call vào Python class với simple API: \`agent.price(description) → price\`.

Pattern: agent class ẩn complexity (Modal connection, model loading, preprocessing).
`,
            code: `# In agents/specialist_agent.py:
import modal
import logging
from agents.preprocessor import Preprocessor

class SpecialistAgent:
    name = "Specialist Agent"

    def __init__(self):
        logging.info("Initializing Specialist Agent")
        Pricer = modal.Cls.from_name("pricer-service", "Pricer")
        self.pricer = Pricer()
        self.preprocessor = Preprocessor()
        logging.info("Specialist Agent ready")

    def price(self, description: str) -> float:
        logging.info(f"Specialist Agent pricing: {description[:50]}...")

        # Step 1: preprocess raw description
        processed = self.preprocessor.preprocess(description)

        # Step 2: call Modal pricer
        price = self.pricer.price.remote(processed)

        logging.info(f"Specialist Agent estimate: \${price}")
        return price


# In notebook:
from agents.specialist_agent import SpecialistAgent

agent = SpecialistAgent()
result = agent.price("iPhone 10")
print(result)
# Specialist Agent pricing: iPhone 10...
# Specialist Agent estimate: $750`,
            after: `
**Mổ xẻ:**

**Constructor pattern:**

\`\`\`python
def __init__(self):
    self.pricer = Pricer()           # connect Modal
    self.preprocessor = Preprocessor() # init preprocessor
\`\`\`

Init expensive (Modal connection setup). Sau init, mỗi \`.price()\` call fast.

**\`Preprocessor\`** — wrap LLM call to clean raw input thành format LLaMA expects:

- Raw: "Quadcast HyperX condenser mic, connects via usb-c..."
- Processed: "Title: Quadcast HyperX Condenser Microphone\\nCategory: Audio\\n..."

Format match training data → better predictions.

**Why preprocess:**

Day 2 W6 đã preprocess training data thành 5-field format. LLaMA fine-tuned expect input có cùng format. Raw user input không match → degraded performance.

**Logging pattern:**

\`logging.info(...)\` trace mỗi step. Khi build agent system, logs essential cho debug.

**Day 1 wrap-up:**

- ✅ Modal account + tokens
- ✅ Hello world deployed
- ✅ LLaMA fine-tuned deployed
- ✅ SpecialistAgent class

**Day 2 sẽ build:**
- FrontierAgent (RAG + GPT-5)
- EnsembleAgent (combine multiple agents)
`
        }
    ]
});
