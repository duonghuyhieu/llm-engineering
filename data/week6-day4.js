window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 6,
    day: 4,
    title: "Human Baseline · PyTorch Neural Network · Frontier API zero-shot",
    notebooks: ["week6/day4.ipynb"],
    topics: [
        "Human baseline — north star cho task",
        "PyTorch Neural Network 8 layers từ scratch",
        "HashingVectorizer thay CountVectorizer cho memory efficiency",
        "MSELoss + Adam optimizer + epoch loop",
        "Frontier API zero-shot: GPT-4.1-nano, Claude, Gemini, Grok, GPT-5",
        "Bảng so sánh end-to-end"
    ],
    summary: `
## 1. Day 4 — escalation từ Traditional ML

Day 3: best ML cổ điển → XGBoost $50 error.

Day 4 test 2 approach mới:
1. **Neural Network**: deep learning với PyTorch
2. **Frontier API zero-shot**: gọi LLM cloud, no training

Plus **human baseline**: bạn tự đoán → so sánh.

## 2. Human baseline = north star

**Quan trọng nhất nhưng hay bỏ qua:** *human làm task này tốt thế nào?*

Approach:
- Write test items vào CSV
- Human (bạn) annotate 50-100 items
- Đo error của human

Ý nghĩa:
- **Set ceiling kỳ vọng.** Nếu human error $70 và model error $50 → model **giỏi hơn human cho task này**.
- **Reveal task complexity.** Human cũng sai $70 → task khó intrinsic.
- **Calibrate expectations.** Đừng pursue "perfect model" — biết practical limit.

## 3. PyTorch Neural Network architecture

Day 4 build 8-layer feedforward NN:

\`\`\`
Input (5000 features từ HashingVectorizer)
   ↓ Linear(5000 → 128) + ReLU
   ↓ Linear(128 → 64) + ReLU
   ↓ Linear(64 → 64) + ReLU
   ↓ Linear(64 → 64) + ReLU
   ↓ Linear(64 → 64) + ReLU
   ↓ Linear(64 → 64) + ReLU
   ↓ Linear(64 → 64) + ReLU
   ↓ Linear(64 → 1)
Output (price)
\`\`\`

**8 layers — overkill cho task này.** Mục đích education: show PyTorch pattern, demonstrate depth.

## 4. HashingVectorizer vs CountVectorizer

| | CountVectorizer | HashingVectorizer |
|---|---|---|
| Build vocab | Cần fit trước | Không cần — hash function |
| Memory | High (lưu vocab) | Low (no vocab stored) |
| Reversible | Có (vocab → text) | Không |
| Production-ready | Slow with big data | Streaming OK |

HashingVectorizer phù hợp khi **stream data lớn** — không thể fit toàn bộ vocab trong RAM.

## 5. Frontier API showdown

Test 5 frontier models:
- \`gpt-4.1-nano\`: cheap, fast
- \`claude-opus-4-5\`: expensive, top quality
- \`gemini-2.5-flash-lite\`: cheap
- \`gemini-3-pro-preview\`: top
- \`grok-4-1-fast\`: cheap, fast
- \`gpt-5.1\` with reasoning high: most expensive

Pattern: prompt simple "Estimate price, reply only number" → \`evaluate()\` framework.

## 6. Kết quả tổng hợp

| Model | Error | Note |
|---|---|---|
| Random | $329 | Floor |
| XGBoost (Day 3) | $50 | Best traditional |
| Neural Network 8-layer | $95-120 | Underperform (small data) |
| Human baseline | $70 | Ceiling? |
| gpt-4.1-nano | $76 | Cheap frontier |
| claude-opus-4-5 | $66 | |
| gemini-2.5-flash-lite | $74 | |
| gemini-3-pro-preview | $52 | |
| grok-4-1-fast | $73 | |
| gpt-5.1 (reasoning high) | $52 | Best frontier zero-shot |

**Big insights:**
- **XGBoost trained beat hầu hết frontier zero-shot** — traditional ML > LLM cho specific task có nhiều data
- **Top frontier (Gemini 3, GPT-5.1) ngang XGBoost** — impressive zero-shot
- **Tuần 7 sẽ fine-tune frontier** để xem có vượt qua trained XGBoost không
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho NN:** Coi mỗi layer như 'enrichment step'. Layer 1: 'features thô' → 'có nghĩa cơ bản'. Layer 8: 'có nghĩa cao cấp'. Cuối cùng → price. Càng deep → càng abstract."
        },
        {
            type: "warn",
            text: "**Đừng skip baseline để 'thử model xịn'.** Dự án không có baseline = không có context. Sếp hỏi 'tốt đến đâu' → không trả lời được nếu không có baseline."
        }
    ],
    keyPoints: [
        "**DL không phải lúc nào tốt hơn ML.** Cho tabular data nhỏ-vừa, XGBoost thường thắng.",
        "**Learning rate là HP quan trọng nhất.** Default 1e-3 với Adam là 'usually OK'.",
        "**Frontier zero-shot baseline rất mạnh cho text task.** Đôi khi đủ tốt → không cần model riêng.",
        "**Human baseline = north star.** Set realistic ceiling.",
        "**Train với batch nhỏ → fit GPU nhỏ.** Không GPU? \`device='cpu'\`, batch_size=8.",
        "**Val loss > Train loss = overfitting.** Theo dõi cả 2 mỗi epoch."
    ],
    code: [
        {
            title: "Bước 1 — Setup human baseline",
            lang: "python",
            before: `
**Pattern:** export 100 test items thành CSV (chỉ description, không price) → human annotate → read back.

Đây là labor-intensive (15-30 phút cho 100 items) nhưng **invaluable** để hiểu task limit.
`,
            code: `import csv

# Write test items vào CSV - human điền cột 2 với price predicted
with open('human_in.csv', 'w', encoding="utf-8") as csvfile:
    writer = csv.writer(csvfile)
    for t in test[:100]:
        writer.writerow([t.summary, 0])    # cột 2 = 0, human override

# Sau khi human annotate xong vào human_out.csv:
human_predictions = []
with open('human_out.csv', 'r', encoding="utf-8") as csvfile:
    reader = csv.reader(csvfile)
    for row in reader:
        human_predictions.append(float(row[1]))

# Wrapper function để compatible với evaluate()
def human_pricer(item):
    idx = test.index(item)
    return human_predictions[idx]

# Evaluate trên 100 items
evaluate(human_pricer, test, size=100)`,
            after: `
**Output điển hình (sau khi Edward tự annotate 100 items):**

\`\`\`
Human Pricer
Average error: $70-90
Hit rate: 40-50%
\`\`\`

**Quan sát:**

- Human error $70-90 → **không hoàn hảo**. Task có aleatoric uncertainty (nhiễu inherent).
- Hit rate 40-50% → human đoán "khoảng đúng" cho ~half items.

**Insight quan trọng:**

Nếu model đạt error $50, **giỏi hơn human cho task này** (về metric). Đáng deploy production.

Nếu model đạt error $100, **gần human**. Acceptable cho most use cases.

Nếu model đạt error $30, **vượt xa human** — có thể là **overfit** (test set leak vào train), kiểm tra leak.

**Practical:**

Cho task quan trọng, ALWAYS measure human baseline. Đặc biệt khi pitch business:
- "Model error $50 vs human $80 — productivity gain 1.6×"
- "Model handles 1000 items/giây vs human 1 item/30s — throughput 30K×"

→ Concrete numbers cho ROI calculation.
`
        },
        {
            title: "Bước 2 — HashingVectorizer cho text → features",
            lang: "python",
            before: `
**HashingVectorizer** thay CountVectorizer (Day 3) — better cho memory + streaming.

**\`binary=True\`**: vector binary (token present = 1, absent = 0). Đây là "one-hot vector" — simpler hơn count.
`,
            code: `import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

y = np.array([float(item.price) for item in train])
documents = [item.summary for item in train]

# HashingVectorizer cho 5000 features
np.random.seed(42)
vectorizer = HashingVectorizer(
    n_features=5000,
    stop_words='english',
    binary=True,
)
X = vectorizer.fit_transform(documents)

print(f"Feature matrix shape: {X.shape}")
# (800000, 5000) - 800K items × 5000 features`,
            after: `
**Mổ xẻ:**

- **\`n_features=5000\`**: hash text thành vector 5000-dim. Vocab implied bởi hash function, không stored.
- **\`stop_words='english'\`**: loại "the", "a"
- **\`binary=True\`**: 0/1 instead of counts. NN dễ học hơn (no scale issues)

**Tại sao HashingVectorizer cho big data:**

CountVectorizer phải fit vocab trước (1 pass full data) → memory tăng tuyến tính. Với 800K items + vocab ~50K words → ~40GB memory.

HashingVectorizer: hash function deterministic, **no vocab stored**. Memory constant regardless data size. Streaming-friendly.

**Trade-off hash collision:**

Different words → same hash. Vd "professional" và "industrial" có thể collide. NN sẽ confuse. Mitigate: tăng \`n_features\` (5K → 20K).

Cho task này, 5K đủ. Production thường 10K-30K.
`
        },
        {
            title: "Bước 3 — Định nghĩa Neural Network 8 layers",
            lang: "python",
            before: `
**PyTorch nn.Module pattern.** Define class với:
- \`__init__\`: declare layers
- \`forward\`: define data flow

8 layers — overkill cho task này nhưng educational. Production usually 2-4 hidden layers.
`,
            code: `import torch
import torch.nn as nn
import torch.optim as optim

class NeuralNetwork(nn.Module):
    def __init__(self, input_size):
        super(NeuralNetwork, self).__init__()
        self.layer1 = nn.Linear(input_size, 128)
        self.layer2 = nn.Linear(128, 64)
        self.layer3 = nn.Linear(64, 64)
        self.layer4 = nn.Linear(64, 64)
        self.layer5 = nn.Linear(64, 64)
        self.layer6 = nn.Linear(64, 64)
        self.layer7 = nn.Linear(64, 64)
        self.layer8 = nn.Linear(64, 1)         # output 1 number (price)
        self.relu = nn.ReLU()

    def forward(self, x):
        output1 = self.relu(self.layer1(x))
        output2 = self.relu(self.layer2(output1))
        output3 = self.relu(self.layer3(output2))
        output4 = self.relu(self.layer4(output3))
        output5 = self.relu(self.layer5(output4))
        output6 = self.relu(self.layer6(output5))
        output7 = self.relu(self.layer7(output6))
        output8 = self.layer8(output7)         # no activation cuối — regression
        return output8

# Init model
input_size = X.shape[1]   # 5000
model = NeuralNetwork(input_size)

# Count params
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Trainable parameters: {trainable_params:,}")
# Trainable parameters: 666,177`,
            after: `
**Mổ xẻ architecture:**

**Pyramid shape:**
- Layer 1: 5000 → 128 (compress features)
- Layers 2-7: 64 → 64 (refine representation)
- Layer 8: 64 → 1 (output price)

**ReLU activation** giữa layers — introduce non-linearity. Without activation, 8 layers ≡ 1 layer (chỉ là matrix multiplications).

**Layer 8 KHÔNG có activation** — regression output có thể negative or positive, không want clip.

**Param count: 666K parameters.**

So sánh:
- LLaMA 7B: 7,000,000,000 params (10,000× more)
- BERT base: 110,000,000 params (165× more)
- Day 4 NN: 666,177 params

Tiny model so với LLMs. **Tabular task small data → tiny model đủ.** Không cần GPT scale.

**8 layers thực sự overkill.** 2-3 layers thường đủ cho 666K params. Edward đi 8 để demo PyTorch syntax — students see how layers stack.

Production: try 2-4 hidden layers trước, deeper chỉ khi cần.
`
        },
        {
            title: "Bước 4 — Training loop với DataLoader",
            lang: "python",
            before: `
**Standard PyTorch training pattern.** 4 phases mỗi step:

1. **Forward pass**: predict
2. **Loss calculation**: compare predicted vs actual
3. **Backward pass**: compute gradients
4. **Optimize**: update weights
`,
            code: `from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from tqdm.notebook import tqdm

# Convert sparse matrix to tensor
X_train_tensor = torch.FloatTensor(X.toarray())
y_train_tensor = torch.FloatTensor(y).unsqueeze(1)   # (N, 1)

# Split train/val (use 1% as internal val)
X_train, X_val, y_train, y_val = train_test_split(
    X_train_tensor, y_train_tensor,
    test_size=0.01, random_state=42,
)

# DataLoader cho batch processing
train_dataset = TensorDataset(X_train, y_train)
train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)

# Loss + Optimizer
loss_function = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

EPOCHS = 2

for epoch in range(EPOCHS):
    model.train()
    for batch_X, batch_y in tqdm(train_loader):
        optimizer.zero_grad()                  # reset gradients
        outputs = model(batch_X)               # forward
        loss = loss_function(outputs, batch_y) # loss
        loss.backward()                         # backward
        optimizer.step()                        # update weights

    # Eval on val set
    model.eval()
    with torch.no_grad():
        val_outputs = model(X_val)
        val_loss = loss_function(val_outputs, y_val)

    print(f'Epoch [{epoch+1}/{EPOCHS}], Train Loss: {loss.item():.3f}, Val Loss: {val_loss.item():.3f}')`,
            after: `
**Mổ xẻ:**

**Training loop components:**

1. **\`optimizer.zero_grad()\`**: reset gradient accumulators. Without it, gradients accumulate qua iterations → wrong updates.

2. **\`model(batch_X)\`**: forward pass. PyTorch auto-track operations cho backward.

3. **\`loss.backward()\`**: backprop. Compute gradient cho mọi parameter.

4. **\`optimizer.step()\`**: update parameters dùng gradients.

**\`model.train()\` vs \`model.eval()\`**:
- \`train()\`: activate dropout, batch norm. Day 4 không dùng dropout nhưng best practice.
- \`eval()\`: deactivate dropout, fix batch norm statistics. Cho consistent eval.

**\`with torch.no_grad():\`** — disable gradient tracking trong eval. Save memory, faster.

**Loss progression mẫu:**

\`\`\`
Epoch [1/2], Train Loss: 8523.43, Val Loss: 9012.21
Epoch [2/2], Train Loss: 7234.12, Val Loss: 8856.43
\`\`\`

**MSE loss** thường lớn (vì squared). Cần convert thành intuitive metric:

\`sqrt(8856) ≈ $94\` → RMSE ~$94. Đây là baseline NN performance.

**Train > Val loss?** Slight overfit, but acceptable cho 2 epochs. Train longer → likely overfit hơn. Day 4 keep simple.
`
        },
        {
            title: "Bước 5 — Eval NN trên test set",
            lang: "python",
            before: `
**Test NN với evaluator framework.** Wrap thành \`pricer\` function signature standard.
`,
            code: `def neural_network(item):
    model.eval()
    with torch.no_grad():
        vector = vectorizer.transform([item.summary])
        vector = torch.FloatTensor(vector.toarray())
        result = model(vector)[0].item()
    return max(0, result)   # clip negative prices

evaluate(neural_network, test)`,
            after: `
**Output điển hình:**

\`\`\`
Neural Network 8-layer
Average error: $95-120
Hit rate: 22-28%
\`\`\`

**Thực tế: NN này underperform XGBoost ($50).**

**Tại sao?**

1. **Dataset không đủ lớn cho deep NN.** 800K items cho 666K params NN — barely 1:1 ratio. DL thường cần data : params ~10:1 ratio mới shine.

2. **HashingVectorizer mất info.** Hash collisions làm features less informative. Word embeddings (Word2Vec, GloVe) hoặc dense embeddings sẽ tốt hơn.

3. **Architecture không optimal.** 8 layers thừa. Should try 2-3 hidden layers wider.

4. **Training time chưa đủ.** 2 epochs có thể chưa converge.

**Lesson:**

**DL không tự động beat ML cổ điển.** Tabular data small-medium → XGBoost thường win. DL shine khi:
- Data lớn (>10M samples)
- Có pattern complex (image, audio, sequence)
- Features raw (chưa được engineer)

Day 5 sẽ thử fine-tune frontier — leveraging LLM's pretrained knowledge.
`
        },
        {
            title: "Bước 6 — Frontier API zero-shot baseline",
            lang: "python",
            before: `
**Test LLM zero-shot.** Không training, chỉ prompt + call API. Có thể beat XGBoost trained?

**Prompt design:** simple, focused. "Estimate price, reply only number."
`,
            code: `from litellm import completion

def messages_for(item):
    message = f"Estimate the price of this product. Respond with the price, no explanation\\n\\n{item.summary}"
    return [{"role": "user", "content": message}]

# Test 5 frontier models

def gpt_4_1_nano(item):
    response = completion(model="openai/gpt-4.1-nano", messages=messages_for(item))
    return response.choices[0].message.content

evaluate(gpt_4_1_nano, test)
# Output: Average error: $76

def claude_opus_4_5(item):
    response = completion(model="anthropic/claude-opus-4-5", messages=messages_for(item))
    return response.choices[0].message.content

evaluate(claude_opus_4_5, test)
# Output: Average error: $66

def gemini_3_pro_preview(item):
    response = completion(
        model="gemini/gemini-3-pro-preview",
        messages=messages_for(item),
        reasoning_effort='low',
    )
    return response.choices[0].message.content

evaluate(gemini_3_pro_preview, test, size=50, workers=2)
# Output: Average error: $52

def gpt_5_1(item):
    response = completion(
        model="gpt-5.1",
        messages=messages_for(item),
        reasoning_effort='high',
        seed=42,
    )
    return response.choices[0].message.content

evaluate(gpt_5_1, test)
# Output: Average error: $52`,
            after: `
**Final ranking (10K test set):**

| Model | Zero-shot Error | Cost/eval (10K items) |
|---|---|---|
| Random pricer | $329 | $0 |
| Mean pricer | $99 | $0 |
| BoW + Linear | $95 | $0 (after setup) |
| Neural Network 8L | $115 | $0 (after train) |
| XGBoost (Day 3) | $50 | $0 (after train) |
| Human (50 items) | $70 | $$$ time |
| gpt-4.1-nano | $76 | ~$0.50 |
| claude-opus-4-5 | $66 | ~$15 |
| gemini-2.5-flash-lite | $74 | ~$0.40 |
| gemini-3-pro-preview | $52 | ~$5 |
| grok-4-1-fast | $73 | ~$0.50 |
| **gpt-5.1 (reasoning high)** | **$52** | **~$30** |

**Big insights:**

**1. XGBoost trained beat hầu hết frontier zero-shot.** Even $66 Claude Opus tệ hơn $50 XGBoost. Cho task niche với enough data, **trained traditional ML thường win**.

**2. Top frontier (Gemini 3, GPT-5.1) match XGBoost.** Impressive zero-shot. Nhưng cost gấp 100-1000× (per inference). Production: XGBoost wins economics.

**3. Cheap frontier ($0.50/10K) decent.** gpt-4.1-nano $76 — decent baseline. Trade-off: setup time vs marginal cost.

**4. Reasoning effort high lift score đáng kể.** gpt-5.1 high → $52. gpt-5.1 default có thể $65+. **Inference-time compute matter.**

**Day 5 question:** Fine-tune gpt-4.1-nano (cheap base) trên data Insurellm → có vượt qua XGBoost không?

**Spoiler:** Yes nhưng marginally. Day 5 sẽ show.
`
        }
    ]
});
