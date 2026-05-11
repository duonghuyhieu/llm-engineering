window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 8,
    day: 2,
    title: "Chroma RAG · FrontierAgent · EnsembleAgent (weighted avg 3 models)",
    notebooks: ["week8/day2.ipynb"],
    topics: [
        "Build Chroma vectorstore với 400K-800K Amazon products",
        "Visualize 8 categories trong 2D/3D t-SNE",
        "FrontierAgent: RAG-augmented GPT-5.1 pricing",
        "find_similars() retrieve top-5 similar items với prices",
        "Deep Neural Network agent",
        "EnsembleAgent: weighted average của 3 specialists"
    ],
    summary: `
## 1. Day 2 — Multi-agent ensemble

Day 1 build SpecialistAgent (LLaMA fine-tuned). Day 2 thêm:

1. **FrontierAgent** — GPT-5.1 với RAG (retrieval-augmented từ Chroma DB)
2. **NeuralNetworkAgent** — Deep NN (Tuần 6 Day 5 redemption model)
3. **EnsembleAgent** — combine 3 agents thành 1 prediction

**Pattern ensemble:**

\`\`\`
input description
   ↓
┌────────────────┬─────────────────┬──────────────┐
│ FrontierAgent  │ SpecialistAgent │ NN Agent     │
│ GPT-5.1 + RAG  │ LLaMA QLoRA     │ PyTorch DNN  │
└────────────────┴─────────────────┴──────────────┘
   ↓ price1          ↓ price2          ↓ price3
              ┌────────────────┐
              │ Weighted avg   │
              │ 0.8×p1 + 0.1×p2 + 0.1×p3
              └────────────────┘
                     ↓
              Final estimate
\`\`\`

## 2. RAG = retrieval cho price prediction

Khác RAG cho Q&A (Tuần 5), Day 2 RAG cho **price estimation**:

\`\`\`
Item description
   ↓ embed
Vector
   ↓ search Chroma
Top-5 similar items với prices known
   ↓ inject into GPT-5.1 prompt
   ↓
GPT-5.1 estimate based on similar prices
\`\`\`

**Insight:** thay vì GPT bịa giá from scratch, give nó **5 similar items với actual prices** → grounded prediction.

## 3. Chroma vectorstore 400K-800K items

Build từ train set (800K items processed Day 2 W6):
- Use \`all-MiniLM-L6-v2\` (free, fast)
- Embedding 384 dim
- Metadata: category, price (cho retrieval display)
- Persist trên disk → reusable

**Time:** ~30 phút trên GPU, vài giờ trên CPU. One-time investment.

## 4. EnsembleAgent weights

Edward thử weights khác nhau, tìm best combination:

\`\`\`python
def ensemble(item):
    p1 = gpt_5_rag(item)          # FrontierAgent
    p2 = specialist(item)          # SpecialistAgent (LLaMA)
    p3 = deep_neural_network(item) # NN Agent
    return p1 * 0.8 + p2 * 0.1 + p3 * 0.1
\`\`\`

**Why GPT 0.8 weight:** trong Edward's experiments, FrontierAgent (RAG + GPT) accuracy cao nhất. SpecialistAgent (LLaMA) và NN có ít contribution nhưng vẫn add diversity.

**Production:** dùng \`LinearRegression\` train weights trên val set thay vì manual tune.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho ensemble:** Coi như hội đồng chuyên gia. Mỗi chuyên gia có expertise và blind spot riêng. Quyết định cuối từ hội đồng tốt hơn bất kỳ cá nhân nào — nếu các chuyên gia đa dạng background."
        },
        {
            type: "warn",
            text: "**Đừng ensemble 'để có vẻ phức tạp'.** Nếu 1 model đã đủ accuracy và cost-effective, ensemble chỉ làm system phức tạp hơn không cần thiết."
        }
    ],
    keyPoints: [
        "**Diversity > individual quality.** Ensemble 3 model đa dạng > ensemble 3 model tốt nhất nhưng giống nhau.",
        "**RAG cho regression rất powerful.** Đặc biệt khi target có 'precedent' rõ ràng.",
        "**Parallelize ensemble calls.** Sequential = N× latency. Async parallel = 1× latency, vẫn N× cost.",
        "**Ensemble cộng dồn cost.** Cho price prediction app: maybe yes. Realtime chat: probably no.",
        "**Ensemble không che được model kém.** Nếu 1 trong 3 có error rất cao, nó drag down ensemble.",
        "**Weighted weights learned > manual.** 30 phút train Linear Regression > guessing percentages."
    ],
    code: [
        {
            title: "Bước 1 — Build Chroma vectorstore từ 800K items",
            lang: "python",
            before: `
**One-time investment.** Embed 800K product summaries và lưu vào Chroma. Reusable cho mọi RAG query sau.

Dùng \`SentenceTransformer\` (\`all-MiniLM-L6-v2\`) — fast, free, 384-dim.
`,
            code: `import os
import numpy as np
from dotenv import load_dotenv
from huggingface_hub import login
from sentence_transformers import SentenceTransformer
import chromadb
from tqdm.notebook import tqdm
from agents.items import Item

load_dotenv(override=True)
login(os.environ['HF_TOKEN'])

DB = "products_vectorstore"

# Load training data từ Hub
LITE_MODE = False
dataset = f"ed-donner/items_lite" if LITE_MODE else f"ed-donner/items_full"
train, val, test = Item.from_hub(dataset)

# Encoder model
encoder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

# Build Chroma collection
client = chromadb.PersistentClient(path=DB)
collection_name = "products"

if collection_name not in [c.name for c in client.list_collections()]:
    collection = client.create_collection(collection_name)

    # Batch embed 1000 items at a time
    for i in tqdm(range(0, len(train), 1000)):
        batch = train[i:i+1000]
        documents = [item.summary for item in batch]
        vectors = encoder.encode(documents).astype(float).tolist()
        metadatas = [{"category": item.category, "price": item.price} for item in batch]
        ids = [f"doc_{j}" for j in range(i, i + len(batch))]

        collection.add(ids=ids, documents=documents, embeddings=vectors, metadatas=metadatas)

collection = client.get_or_create_collection(collection_name)
print(f"Collection has {collection.count():,} items")`,
            after: `
**Mổ xẻ:**

**Batch embedding (1000 items per batch):**
- Single embed call: ~10s overhead
- Batch 1000: ~5s total → 200× faster
- 800K items / 1000 = 800 batches → ~1 giờ

**Metadata trong Chroma:**

\`\`\`python
{"category": "Electronics", "price": 89.99}
\`\`\`

Critical cho:
- **Display**: when retrieve, show price ngay (no extra DB lookup)
- **Filter**: \`collection.query(..., where={"category": "Electronics"})\`
- **RAG augmentation**: nhồi price vào GPT context

**Persistent storage:**

- \`PersistentClient(path="products_vectorstore")\`: save to disk
- Folder size: ~1-2GB for 800K items × 384 dim × 4 bytes
- Reload across sessions: instant (no re-embed)

**Production scale:** 800K items vẫn comfortable cho Chroma. Vượt 10M → consider Qdrant, Weaviate, Pinecone với HNSW index optimized.
`
        },
        {
            title: "Bước 2 — find_similars(): RAG retrieval cho pricing",
            lang: "python",
            before: `
**RAG retrieval pattern.** Cho test item, find top-5 similar items với known prices. Return cả descriptions + prices.

Đây là **augmentation source** cho FrontierAgent.
`,
            code: `def vector(item):
    """Embed 1 item"""
    return encoder.encode(item.summary)

def find_similars(item, k=5):
    """Retrieve top-k similar items với prices."""
    vec = vector(item)
    results = collection.query(
        query_embeddings=vec.astype(float).tolist(),
        n_results=k,
    )
    documents = results['documents'][0]
    prices = [m['price'] for m in results['metadatas'][0]]
    return documents, prices

# Test
documents, prices = find_similars(test[0])
print(f"Query: {test[0].summary[:100]}...")
print(f"\\nSimilar items found:")
for doc, price in zip(documents, prices):
    print(f"  - \${price:.2f}: {doc[:80]}...")`,
            after: `
**Output mẫu:**

\`\`\`
Query: Title: Boss DS-1 Distortion Pedal
       Category: Musical Instruments...

Similar items found:
  - $49.99: Title: Boss DS-1 Distortion Effects Pedal for Electric Guitar...
  - $59.95: Title: Behringer Vintage Distortion VD400 Effects Pedal...
  - $79.00: Title: TC Electronic Vintage Style Distortion Pedal...
  - $39.99: Title: Joyo JF-01 Vintage Overdrive Pedal...
  - $89.50: Title: MXR Distortion+ M104 Effects Pedal...
\`\`\`

**Quan sát:**

- Top 5 đều **distortion pedals** — semantic search work
- Prices range $39-$89 → cho GPT context để estimate
- **No exact duplicate** (dedupe Day 1 W6 work)

**Pattern này cực hữu ích cho:**
- Price prediction (Day 2 use)
- Product recommendation (e-commerce)
- Similar customer support tickets
- Plagiarism detection (legal docs)

Wherever **"find items similar to this"** problem exists → vector search shines.
`
        },
        {
            title: "Bước 3 — FrontierAgent: RAG + GPT-5.1",
            lang: "python",
            before: `
**Inject context vào GPT prompt.** Concat similar items với prices → mega-prompt → GPT-5.1 estimate.

\`reasoning_effort="none"\` cho task này — không cần deep thinking, chỉ pattern match từ similar items.
`,
            code: `def make_context(similars, prices):
    """Format similar items thành context string."""
    message = "For context, here are some other items that might be similar to the item you need to estimate.\\n\\n"
    for similar, price in zip(similars, prices):
        message += f"Potentially related product:\\n{similar}\\nPrice is \${price:.2f}\\n\\n"
    return message

def messages_for(item, similars, prices):
    """Build full messages cho GPT."""
    message = f"Estimate the price of this product. Respond with the price, no explanation\\n\\n{item.summary}\\n\\n"
    message += make_context(similars, prices)
    return [{"role": "user", "content": message}]

# RAG-augmented pricing function
from litellm import completion

def gpt_5_1_rag(item):
    documents, prices = find_similars(item)
    response = completion(
        model="gpt-5.1",
        messages=messages_for(item, documents, prices),
        reasoning_effort="none",         # task simple, no need thinking
        seed=42,                          # deterministic
    )
    return response.choices[0].message.content

# Test
print(test[0].price)                     # ground truth
print(gpt_5_1_rag(test[0]))             # RAG-augmented estimate
# 79.0
# $55.00

# Evaluate trên test set
from agents.evaluator import evaluate
evaluate(gpt_5_1_rag, test)
# Output: Average error: ~$35-40`,
            after: `
**Mổ xẻ improvements vs zero-shot:**

**GPT-5.1 zero-shot Day 4 W6:** $52 MAE
**GPT-5.1 + RAG Day 2 W8:** ~$35-40 MAE

**Lift đáng kể** chỉ bằng cách inject 5 similar items với prices vào context. RAG **không train new model** — just better prompt.

**Insight:**

GPT-5.1 có **world knowledge** về general pricing (electronics, appliances), nhưng:
- Niche products: GPT không biết exact price
- Time-sensitive pricing: GPT có training cutoff
- Brand-specific premiums: GPT có thể miss

RAG với similar items provide **grounded context** → reduce hallucination, improve accuracy.

**Pattern này áp dụng cho mọi prediction task có "precedent":**
- House pricing (similar properties)
- Salary estimation (similar roles)
- Travel time (similar routes)
- Inventory ordering (similar products demand)

Wherever you have **historical examples**, RAG augmented LLM thường outperform pure LLM hoặc pure ML.
`
        },
        {
            title: "Bước 4 — Specialist + NN agents như functions",
            lang: "python",
            before: `
**Wrap Day 1 Specialist + Tuần 6 NN thành same interface.** Mỗi agent có function signature \`pricer(item) → price\`.
`,
            code: `# Specialist agent (LLaMA fine-tuned trên Modal)
import modal
Pricer = modal.Cls.from_name("pricer-service", "Pricer")
pricer_modal = Pricer()

def specialist(item):
    return pricer_modal.price.remote(item.summary)

# Helper parse price từ string
import re
def get_price(reply):
    reply = str(reply).replace("$", "").replace(",", "")
    match = re.search(r"[-+]?\\d*\\.\\d+|\\d+", reply)
    return float(match.group()) if match else 0

# Neural Network agent (Tuần 6 D5 model)
from agents.deep_neural_network import DeepNeuralNetworkInference

runner = DeepNeuralNetworkInference()
runner.setup()
runner.load("deep_neural_network.pth")

def deep_neural_network(item):
    return runner.inference(item.summary)

# Test cả 3
print(f"FrontierAgent: \${get_price(gpt_5_1_rag(test[0])):.2f}")
print(f"SpecialistAgent: \${specialist(test[0]):.2f}")
print(f"NN Agent: \${deep_neural_network(test[0]):.2f}")
print(f"True price: \${test[0].price:.2f}")`,
            after: `
**Output sample:**

\`\`\`
FrontierAgent: $55.00
SpecialistAgent: $87.50
NN Agent: $42.30
True price: $79.00
\`\`\`

**Mỗi agent có error pattern khác:**

- **FrontierAgent**: thường underestimate (conservative)
- **SpecialistAgent**: gần đúng nhưng có outliers
- **NN Agent**: bias toward training mean

**Diversity** này là **lý do ensemble work.** 3 model "wrong in different ways" → average cancel out errors.

**Test cases khác:**

\`\`\`
Item A: True $200
  FrontierAgent: $180
  Specialist: $250
  NN: $150
  Avg: ~$193  ← closer to true

Item B: True $50
  FrontierAgent: $45
  Specialist: $60
  NN: $40
  Avg: $48    ← very close
\`\`\`

**Ensemble work nếu errors UNCORRELATED.** Day 2 các models có diverse architectures (LLM, NN) → uncorrelated → ensemble lift accuracy.
`
        },
        {
            title: "Bước 5 — EnsembleAgent với weighted average",
            lang: "python",
            before: `
**Final assembly.** Weighted average 3 agents. Weights Edward tune manually: 0.8 GPT + 0.1 Specialist + 0.1 NN.
`,
            code: `def ensemble(item):
    price1 = get_price(gpt_5_1_rag(item))     # FrontierAgent (GPT + RAG)
    price2 = specialist(item)                   # SpecialistAgent (LLaMA)
    price3 = deep_neural_network(item)         # NN Agent
    return price1 * 0.8 + price2 * 0.1 + price3 * 0.1

# Evaluate
from agents.evaluator import evaluate
evaluate(ensemble, test)
# Output: Average error: ~$30-35 (better than any single agent!)`,
            after: `
**Final ranking Tuần 8 Day 2:**

| Agent | MAE | Note |
|---|---|---|
| Random | $329 | Floor |
| XGBoost (W6) | $50 | Best traditional |
| GPT-5.1 zero-shot | $52 | |
| LLaMA fine-tuned (W7) | $46 | |
| DNN (W6 D5) | $40 | |
| **GPT-5.1 + RAG (FrontierAgent)** | **~$35** | RAG lift |
| **Ensemble** | **~$30** | 🏆 Lift từ ensemble |

**Lift breakdown:**

- Best single (FrontierAgent): $35
- Ensemble of 3: $30 → **14% better**

**Cost analysis ensemble:**

- 3× API calls = 3× cost
- 3× latency (nếu sequential)
- Worth it?

**Parallelize cho production:**

\`\`\`python
import asyncio

async def ensemble_async(item):
    results = await asyncio.gather(
        asyncio.to_thread(gpt_5_1_rag, item),
        asyncio.to_thread(specialist, item),
        asyncio.to_thread(deep_neural_network, item),
    )
    p1, p2, p3 = (get_price(r) for r in results)
    return p1 * 0.8 + p2 * 0.1 + p3 * 0.1
\`\`\`

3 calls parallel → latency ≈ slowest single call. Cost vẫn 3× nhưng UX OK.

**Day 2 deliverables:**

- ✅ Chroma vectorstore 800K items
- ✅ FrontierAgent (RAG + GPT-5.1)
- ✅ EnsembleAgent (3-way avg)
- ✅ Final accuracy MAE ~$30

**Day 3 sẽ build:**
- ScannerAgent (RSS feed scraping)
- MessengerAgent (Pushover notifications)
`
        }
    ]
});
