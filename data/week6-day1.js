window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 6,
    day: 1,
    title: "Capstone Price Predictor · Data Curation · Amazon Reviews 2023 · Weighted sampling",
    notebooks: ["week6/day1.ipynb"],
    topics: [
        "Capstone Tuần 6-8: 'The Price is Right' - predict price từ description",
        "Amazon Reviews 2023 dataset từ HuggingFace",
        "Item class wrap parsing logic",
        "Distribution analysis: lengths, prices, categories",
        "Deduplication theo title và full text",
        "Weighted sampling để balance distribution",
        "Push curated dataset lên HF Hub"
    ],
    summary: `
## 1. The Price Is Right capstone

**Bài toán:** model predict giá USD từ description Amazon product.

\`\`\`
Input:  "Sony WH-1000XM5 Wireless Noise Canceling Headphones..."
Output: $399
\`\`\`

**Lý do chọn task:**
- Data abundant (Amazon Reviews 2023 dataset có hàng triệu items)
- Verifiable (giá thật vs predicted)
- Many approaches để so sánh: ML cổ điển → DL → Frontier API → Fine-tune
- Business value rõ (pricing, market intel)

**Pipeline 5 days:**

| Day | Topic | Output |
|---|---|---|
| 1 | Data Curation | Cleaned, deduped, balanced dataset |
| 2 | Pre-processing | LLM-rewritten standardized format |
| 3 | Baselines + Traditional ML | Random/Linear/RF/XGBoost |
| 4 | Neural Networks + Frontier | PyTorch NN + GPT/Claude/Gemini baseline |
| 5 | Fine-tune Frontier | gpt-4.1-nano fine-tuned |

## 2. Data curation - quy luật 70/20/10

Quy luật ngành: data engineer dành 70% thời gian curate data, 20% train model, 10% deploy. **Project AI thất bại đa số vì data, không phải model.**

8 stages:

\`\`\`
SOURCE → EXPLORE → CLEAN → FILTER → TRANSFORM → BALANCE → SPLIT → PUSH
\`\`\`

## 3. Amazon Reviews 2023 dataset

[McAuley-Lab/Amazon-Reviews-2023](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023) — dataset cực lớn từ Julian McAuley (UCSD).

- Hàng chục million products across categories
- Mỗi item có: title, description, features, price, weight, brand, category
- License: research/non-commercial

Day 1 dùng 8 categories: Automotive, Electronics, Office, Tools, Cell Phones, Toys, Appliances, Musical Instruments.

## 4. Distribution analysis trước khi train

Plot 3 thứ:
- **Histogram price**: thường right-skewed mạnh
- **Histogram text length**: outlier dài (description spam)
- **Bar chart category**: imbalanced

**Phát hiện điển hình:**
- Price median ~$30, mean ~$80, max $5000+
- 80% items <$50 → model train naïve sẽ bias đoán thấp
- Long tail rất dài → cần xử lý

## 5. Weighted sampling

Fix imbalance bằng cách sample weighted theo price + category. \`p**2\` weight ưu tiên high-price items để balance distribution.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho data work:** Coi dataset như nguyên liệu nấu ăn. Có thể có công thức (model) hoàn hảo, nhưng nguyên liệu hỏng → món ăn hỏng. Đầu bếp giỏi dành phần lớn thời gian chọn và sơ chế nguyên liệu."
        },
        {
            type: "warn",
            text: "**Cảnh báo data leakage subtle:** scaling/normalize TRƯỚC train-test split → leak statistics của test vào train. Quy tắc: \`fit\` chỉ trên train, \`transform\` lên cả ba set."
        }
    ],
    keyPoints: [
        "**Data > Model.** Một dataset clean nhỏ thường beat dataset bẩn lớn.",
        "**Distribution analysis là first step bắt buộc.** Không hiểu distribution → mọi quyết định mò mẫm.",
        "**Deduplication không 100% được.** Chấp nhận imperfection, nhưng exact duplicate phải xử lý.",
        "**Weighted sampling khác data augmentation.** Sampling lặp lại data có sẵn. Augmentation tạo synthetic. Mục đích khác nhau.",
        "**Test set chỉ touch một lần.** Liếc test rồi quyết định 'thử feature X' → đã contaminate.",
        "**Stratified split cho imbalanced data.** Random split có thể tạo test set không có class hiếm."
    ],
    code: [
        {
            title: "Bước 1 — Load Amazon Reviews 2023 dataset",
            lang: "python",
            before: `
**HuggingFace datasets** — load dataset lớn với streaming/lazy loading. Dataset có nhiều configurations (raw_meta_*), mỗi category là 1 config.

\`trust_remote_code=True\` cần thiết vì dataset có custom loader script. Chỉ enable cho dataset tin cậy (Julian McAuley là researcher uy tín UCSD).
`,
            code: `import os
from dotenv import load_dotenv
from huggingface_hub import login
from datasets import load_dataset
import matplotlib.pyplot as plt
from tqdm.notebook import tqdm
import numpy as np
import random
from pricer.items import Item
from pricer.parser import parse

load_dotenv(override=True)

# Login HF (cần token cho gated dataset)
hf_token = os.environ['HF_TOKEN']
login(hf_token, add_to_git_credential=True)

# Load 1 category trước để inspect
dataset = load_dataset(
    "McAuley-Lab/Amazon-Reviews-2023",
    "raw_meta_Appliances",                  # config name
    split="full",                            # toàn bộ data
    trust_remote_code=True,
)

print(f"Number of Appliances: {len(dataset):,}")
# Output: Number of Appliances: 94,327

# Investigate 1 datapoint
dataset[6]`,
            after: `
**Output mẫu (dataset[6]):**

\`\`\`python
{
    'main_category': 'Appliances',
    'title': 'GE Profile™ 30" Stainless Steel Smart Slide-In Front-Control Induction Range',
    'average_rating': 4.5,
    'rating_number': 89,
    'features': ['30 inch Built-in Induction Range with True European Convection...'],
    'description': ['The GE Profile Smart Slide-In Induction Range features...'],
    'price': '$2,499.00',
    'images': [...],
    'videos': [],
    'store': 'GE Appliances',
    'categories': [...],
    'details': {...},
    'parent_asin': 'B0...',
    'bought_together': None,
}
\`\`\`

**Quan sát:**

- **Price là string** \`'$2,499.00'\` — phải parse thành float để dùng. Một số entries có None, "Price not available", multi-currency.
- **Description là list** thay string. Có thể empty hoặc nhiều paragraphs.
- **Lots of optional fields** — không phải item nào cũng có price, weight, brand.

**\`Item\` class trong \`pricer/items.py\`** wrap parsing logic này — extract title, price, weight, category vào fields có type rõ. Day 1 không deep-dive code của Item, focus vào pipeline.
`
        },
        {
            title: "Bước 2 — Parse + filter với Item class",
            lang: "python",
            before: `
**Parse từ raw dataset → Item objects.** \`parse()\` function của khóa:
- Extract price (chuyển string \`"$1,299.99"\` → float)
- Extract weight (parse "5.2 ounces" → grams)
- Filter items không có price hoặc out of range $1-$1000
- Filter items có description < 100 chars (chất lượng thấp)
- Build \`item.full\` = combined description text
`,
            code: `# Parse từng datapoint thành Item, filter None
items = [parse(datapoint, "Appliances") for datapoint in tqdm(dataset)]
items = [item for item in items if item is not None]

print(f"There are {len(items):,} items from {len(dataset):,} datapoints")
# Output: There are 11,295 items from 94,327 datapoints

# Inspect 1 item
print(items[0].full)
# Output:
# Title: Bosch SilencePlus 42 dBA Dishwasher
# Brand: Bosch
# Weight: 75.2 ounces
# Description: ...
# Features: ...
# Price: $899.00`,
            after: `
**Mổ xẻ filter pipeline:**

Từ 94K raw → 11K items = **~12% retention rate**. Phần lớn bị filter vì:
- Không có price (\`None\` hoặc invalid format)
- Price ngoài range $1-$1000 (mục tiêu task)
- Description quá ngắn (< 100 chars, không đủ context cho model học)

**\`item.full\`** = combined string representation. Đây là **input cho model** ở các day sau.

**Trade-off filter aggressive:**

- ✅ Quality cao, model học từ data clean
- ❌ Mất data — chỉ giữ 12%

Production thường relax filter để giữ nhiều data hơn, trade off chất lượng. Day 1 chọn quality > quantity vì capstone education.

**Custom filter** trong \`pricer/parser.py\` — students có thể đọc và adjust nếu muốn.
`
        },
        {
            title: "Bước 3 — Visualize distribution: lengths + prices",
            lang: "python",
            before: `
**Critical step trước khi train.** Không hiểu distribution → mọi quyết định downstream mò mẫm.

Plot 2 distributions:
1. **Text length** — phát hiện outlier description
2. **Price** — confirm right-skewed, xác định range
`,
            code: `prices = [item.price for item in items]
lengths = [len(item.full) for item in items]

# Distribution of lengths
plt.figure(figsize=(15, 6))
plt.title(f"Lengths: Avg {sum(lengths)/len(lengths):,.0f} and highest {max(lengths):,}")
plt.xlabel('Length (chars)')
plt.ylabel('Count')
plt.hist(lengths, rwidth=0.7, color="lightblue", bins=range(0, 6000, 100))
plt.show()

# Distribution of prices
plt.figure(figsize=(15, 6))
plt.title(f"Prices: Avg \${sum(prices)/len(prices):,.2f} and highest \${max(prices):,}")
plt.xlabel('Price ($)')
plt.ylabel('Count')
plt.hist(prices, rwidth=0.7, color="orange", bins=range(0, 1000, 10))
plt.show()`,
            after: `
**Output điển hình:**

**Text length distribution:**
- Median: ~500 chars
- Max: ~5000 chars (outlier — spam product descriptions)
- 90% items có length 200-1500 chars

**Price distribution:**
- **Right-skewed heavy** — đa số items dưới $50
- Mode quanh $10-30
- Long tail tới $1000

**Insights từ plots:**

1. **Need to balance**: nếu train với raw distribution, model sẽ bias mạnh về low prices. **Weighted sampling** cần thiết.

2. **Need to truncate**: text > 3000 chars → outlier, có thể skip để giảm noise.

3. **Range OK**: $1-$1000 đã được filter, phù hợp với task.

**Pattern:** plot histogram **trước** bất kỳ training nào. 5 phút inspect = avoid hours of confused debugging.
`
        },
        {
            title: "Bước 4 — Load 8 categories cho dataset đủ lớn",
            lang: "python",
            before: `
**Scale up từ 1 category.** ItemLoader helper class loop qua categories và load song song.

Mục tiêu: ~800K items tổng cộng từ 8 categories đa dạng.
`,
            code: `from pricer.loaders import ItemLoader

# 1 category - test
loader = ItemLoader("Appliances")
items = loader.load()

# 8 categories - full
dataset_names = [
    "Automotive",
    "Electronics",
    "Office_Products",
    "Tools_and_Home_Improvement",
    "Cell_Phones_and_Accessories",
    "Toys_and_Games",
    "Appliances",
    "Musical_Instruments",
]

items = []
for dataset_name in dataset_names:
    loader = ItemLoader(dataset_name)
    items.extend(loader.load())

print(f"A grand total of {len(items):,} items")
# Output: A grand total of 2,808,012 items`,
            after: `
**2.8M items** từ 8 categories — dataset đủ lớn cho serious ML training.

**Time để load:** ~5-10 phút (network + parsing). Mỗi category download ~1-3GB.

**Disk space:** ~15-20GB cho HF cache.

**Category distribution điển hình:**

| Category | Items |
|---|---|
| Automotive | 600K |
| Tools_and_Home_Improvement | 500K |
| Electronics | 400K |
| Office_Products | 300K |
| Cell_Phones_and_Accessories | 250K |
| Toys_and_Games | 250K |
| Appliances | 100K |
| Musical_Instruments | 80K |

**Imbalance lớn:** Automotive 600K vs Musical_Instruments 80K (7.5× lệch). Bước 5 sẽ balance.
`
        },
        {
            title: "Bước 5 — Deduplication: title + full text",
            lang: "python",
            before: `
**Dedupe 2 levels:**

1. **By title**: 2 items có title giống → keep 1 (cùng product, multiple listings)
2. **By full text**: 2 items có full description giống → keep 1

**Pattern \`seen.add(x.title)\`:** \`set.add()\` return \`None\`, evaluate False → keep item. Nếu đã trong set → \`add\` no-op, \`x.title in seen\` True → filter out.
`,
            code: `random.seed(42)
random.shuffle(items)

# Dedupe theo title
seen = set()
items = [x for x in tqdm(items) if not (x.title in seen or seen.add(x.title))]

# Dedupe theo full text
seen = set()
items = [x for x in tqdm(items) if not (x.full in seen or seen.add(x.full))]

del seen
print(f"After deduplication, we have {len(items):,} items")
# Output: After deduplication, we have 2,401,567 items`,
            after: `
**Quan sát:**

2.8M → 2.4M items sau dedupe = **~14% là duplicate**.

**Tại sao Amazon có nhiều duplicate:**
- Multiple sellers cùng product (Amazon allows multiple listings)
- Same product với slight variation (color, size) nhưng identical description
- Reprints/refurbished listings

**Tại sao dedupe matter:**

- **Train set có duplicate** → model 'memorize' thay vì học generalize
- **Test set có copy của train** → leakage → metric overestimate
- **Eval bias** — model có vẻ tốt nhưng thực ra học vẹt

**Limitation:** dedupe by exact match miss **near-duplicate** (typo, slight wording). Production dùng:
- MinHash + LSH cho fuzzy dedupe
- Embedding similarity (cosine > 0.95 = duplicate)

Day 1 keep simple với exact match — đủ cho 14% dedupe rate.
`
        },
        {
            title: "Bước 6 — Weighted sampling: balance distribution",
            lang: "python",
            before: `
**Fix imbalance.** 2 dimensions cần balance:

1. **Price distribution** — đa số items giá thấp → bias model
2. **Category distribution** — Automotive dominate

Strategy:
- Weight item theo \`price**2\` → ưu tiên high-price items (rare)
- Reduce Automotive (50%) và Tools (95%) weights để balance category
- Sample 820K items với probability proportional to weights
`,
            code: `np.random.seed(42)

SIZE = 820_000

# Normalize prices to [0, 1]
prices = np.array([it.price for it in items], dtype=float)
categories = np.array([it.category for it in items])
p = (prices - prices.min()) / (prices.max() - prices.min() + 1e-9)

# Squared weights - high prices get exponentially more weight
w = p**2

# Down-weight overrepresented categories
w[categories == "Tools_and_Home_Improvement"] *= 0.5
w[categories == "Automotive"] *= 0.05

# Normalize to probabilities
w = w / w.sum()

# Weighted sample without replacement
idx = np.random.choice(len(items), size=SIZE, replace=False, p=w)
sample = [items[i] for i in idx]

print(f"Sampled {len(sample):,} items")`,
            after: `
**Mổ xẻ weighting logic:**

**\`p**2\` (squared prices):**
- Price $10: weight 0.0001
- Price $100: weight 0.01
- Price $1000: weight 1.0
- → High-price items 100× more likely to be sampled

**Category dampening:**
- \`Tools × 0.5\`: reduce 50%
- \`Automotive × 0.05\`: reduce 95% (vì Automotive overrepresented)

**Result distribution:**
- Price: more uniform than raw (still skewed nhưng less extreme)
- Category: more balanced (Automotive vẫn lead nhưng không dominate)

**Re-plot price distribution của sample** → confirm shift. Đây là biểu hiện "data engineering art": tune weights cho đến khi distribution chấp nhận được.

**Trade-off:** sample biased ≠ population real. Production phải decide:
- Train với balanced (model generalize tốt nhưng calibration off)
- Train với natural distribution (calibration đúng nhưng bias to common items)

Đại đa số projects: balanced for training, evaluate trên natural distribution để test calibration.
`
        },
        {
            title: "Bước 7 — Train/Val/Test split + push HF Hub",
            lang: "python",
            before: `
**Final step.** Shuffle final + split 800K/10K/10K → push lên HuggingFace Hub.

**Pattern:** 2 dataset versions:
- \`items_raw_full\`: 820K items
- \`items_raw_lite\`: 22K items (smaller cho local testing, Colab free tier)

Hub allow easy share, reproducibility, version control.
`,
            code: `# Final shuffle
random.seed(42)
random.shuffle(sample)

# Push lên Hub
username = "ed-donner"     # đổi thành username của bạn
full = f"{username}/items_raw_full"
lite = f"{username}/items_raw_lite"

# Split 800K / 10K / 10K
train = sample[:800_000]
val = sample[800_000:810_000]
test = sample[810_000:]

Item.push_to_hub(full, train, val, test)

# Lite version cho fast iteration
train_lite = train[:20_000]
val_lite = val[:1_000]
test_lite = test[:1_000]

Item.push_to_hub(lite, train_lite, val_lite, test_lite)`,
            after: `
**Mổ xẻ:**

**\`Item.push_to_hub(name, train, val, test)\`** custom helper:
- Convert Item objects → HF Dataset format
- Split thành 3 sets
- Upload to Hub với tên \`{username}/{name}\`

**Tại sao 2 versions:**

- **\`items_raw_full\` (820K)**: serious training. Cần GPU và time.
- **\`items_raw_lite\` (22K)**: iterate nhanh trong notebook, CPU enough. Test pipeline trước khi commit full run.

**Pattern dataset versioning:**

\`\`\`
v1: raw + dedupe                     → items_raw_full
v2: + LLM pre-processing (Day 2)     → items_full
v3: + better filtering               → items_v3
...
\`\`\`

HF Hub có git-like versioning. Mỗi \`push_to_hub\` tạo commit, có thể rollback.

**Reproducibility:** ai cũng load được cùng version. Day 2-5 sẽ \`Item.from_hub("ed-donner/items_lite")\` để start với cùng baseline.

**Day 1 complete.** Sản phẩm: clean, deduped, balanced dataset 820K items trên HF Hub. Day 2 sẽ pre-process bằng LLM.
`
        }
    ]
});
