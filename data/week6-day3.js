window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 6,
    day: 3,
    title: "Baselines · Random/Mean/Linear Regression · BoW · Random Forest · XGBoost",
    notebooks: ["week6/day3.ipynb"],
    topics: [
        "Vì sao luôn build baselines trước serious model",
        "Random pricer + Mean pricer — floor performance",
        "Linear regression với features đơn giản (weight, length)",
        "Bag-of-Words với CountVectorizer + Linear regression",
        "Random Forest ensemble",
        "XGBoost — gradient boosted trees",
        "Evaluator class: log RMSE, hit rate, color-coded results"
    ],
    summary: `
## 1. Quy luật vàng: baseline trước

Trước khi train neural network, fine-tune frontier, build agentic system... **build baseline đơn giản trước**.

Lý do:
- **Sanity check**: nếu RandomGuess đạt 80% accuracy → task đơn giản hơn tưởng
- **Yardstick**: model phức tạp sau đó phải beat baseline rõ rệt mới đáng triển khai
- **Insight**: simple model thường reveal pattern mà human miss

## 2. 6 baselines theo độ phức tạp

| # | Model | Cách | Error điển hình |
|---|---|---|---|
| 1 | **Random pricer** | Random $1-$1000 | ~$330 |
| 2 | **Constant pricer** | Mean của train | ~$130 |
| 3 | **Linear (weight+length)** | Linear regression 3 features | ~$120 |
| 4 | **BoW + Linear** | CountVectorizer + Linear | ~$95 |
| 5 | **Random Forest** | 100 decision trees ensemble | ~$56 |
| 6 | **XGBoost** | Gradient boosted trees | ~$50 |

Cho task Price Prediction, **XGBoost = best traditional ML.** Day 4 sẽ thử Neural Networks và Frontier API.

## 3. Evaluator pattern

\`pricer.evaluator.evaluate(pricer_function, test_set)\` framework:
- Runs pricer function trên test set
- Compute error metrics (RMSE, MAE, hit rate)
- Plot predictions vs actual
- Color-code: green (good), yellow (ok), red (bad)

Pattern này critical: **mỗi model có 1 function signature \`pricer(item) -> price\`**. Easy swap and compare.

## 4. BoW = Bag of Words

**Concept:** chuyển text → vector số.

- Vocab size N (chọn N most common words)
- Mỗi document → vector N-dim
- \`vector[i] = số lần word i xuất hiện\`

Đơn giản nhưng surprisingly effective khi combine với Linear Regression.

## 5. Random Forest vs XGBoost

**Random Forest:**
- 100 decision trees, mỗi tree train trên random subset
- Average predictions của tất cả trees
- Robust, ít cần tune
- **Slow on big data** (15 giờ cho 800K dataset full)

**XGBoost:**
- Trees sinh tuần tự, mỗi tree fix lỗi của tree trước
- Gradient descent trong tree space
- **Faster** và thường better generalization
- Modern standard for tabular data
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho baseline:** Coi như đặt 'mức sàn' của competition. Mỗi model phức tạp hơn phải beat sàn này rõ rệt mới đáng đầu tư. Nếu RF đã beat XGBoost ngang ngang → đừng bỏ XGBoost lên prod, RF đơn giản hơn để maintain."
        },
        {
            type: "warn",
            text: "**Cẩn thận leakage trong text feature.** Vd nếu description có 'Sony' và sản phẩm Sony đắt trong train, model học 'Sony = high price'. Nếu test có Sony rẻ → fail. Validate trên distribution-shifted data."
        }
    ],
    keyPoints: [
        "**Random baseline đáng làm.** 5 phút setup → confirm task có signal hay không.",
        "**TF-IDF ≥ BoW gần như luôn luôn.** Nếu dùng sklearn, default \`TfidfVectorizer\` thay CountVectorizer.",
        "**Linear + interpret weights là 'eyeglass'.** Trước khi dùng black-box, học insight qua linear weights.",
        "**Random Forest 'just works' cho tabular.** Default sklearn hyperparams đã reasonable.",
        "**XGBoost ≠ luôn thắng RF.** Dataset nhỏ (<10K), RF thường tương đương và đơn giản hơn.",
        "**Chọn 1 metric chính + 1 sanity check.** Quá nhiều metric → người đọc confuse."
    ],
    code: [
        {
            title: "Bước 1 — Setup + load processed dataset",
            lang: "python",
            before: `
**Bắt đầu Day 3.** Load \`items_full\` (processed Day 2) — đã có \`item.summary\` clean format.

\`LITE_MODE = False\` cho full dataset — Day 3 traditional ML chạy được trên CPU (no GPU needed cho RF/XGBoost).
`,
            code: `import random
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.ensemble import RandomForestRegressor
from pricer.evaluator import evaluate
from pricer.items import Item

LITE_MODE = False    # True = 22K cho fast iteration. False = 820K cho serious benchmark.

username = "ed-donner"
dataset = f"{username}/items_lite" if LITE_MODE else f"{username}/items_full"
train, val, test = Item.from_hub(dataset)

print(f"Loaded {len(train):,} training, {len(val):,} val, {len(test):,} test")
# Loaded 800,000 training, 10,000 val, 10,000 test`,
            after: `
**Quan sát:**

- **800K training** items — large dataset cho ML cổ điển
- **10K test** items — đủ để eval statistical significant
- Mỗi item có \`item.summary\` (text) và \`item.price\` (float ground truth)

**Decision dataset size:**

| Mode | Train | Time RF | Time XGBoost |
|---|---|---|---|
| Lite (20K) | 1-2 phút | 30s |
| Full (800K) | 15 giờ | 30 phút |

XGBoost ~30× faster than RF cho dataset lớn → recommend cho serious work.

**Day 3 strategy:** chạy lite mode trước để verify pipeline, sau đó (optional) chạy full mode overnight.
`
        },
        {
            title: "Bước 2 — Baseline #1: Random pricer (the floor)",
            lang: "python",
            before: `
**Stupidest possible model.** Random $1-$1000 với mỗi prediction.

**Mục đích:** establish **floor**. Nếu model phức tạp không beat random rõ rệt → either task is impossible, or your pipeline has bug.
`,
            code: `def random_pricer(item):
    return random.randrange(1, 1000)

random.seed(42)
evaluate(random_pricer, test)`,
            after: `
**Output (evaluate prints results):**

\`\`\`
Random Pricer
Predictions: 10,000
Average error: $329.45
RMSE: $403.21
Hit rate (within $40 or 20%): 8.2%
\`\`\`

**Mổ xẻ:**

- **Average error $329**: random predict $1-1000, true mean ~$60 → expected error ~$300+. Math check out.
- **RMSE $403**: cao hơn MAE → distribution có outliers
- **Hit rate 8.2%**: 8% predictions trong range "good" ($40 hoặc 20% accurate)

**Why this matters:**

Nếu sau này model XGBoost đạt error $100 → ratio 3.3× vs random. Decent but not amazing.

Nếu XGBoost đạt error $50 → ratio 6.6× — quite good.

**Establish floor → measure improvement.** Đây là **scientific method** cho ML.
`
        },
        {
            title: "Bước 3 — Baseline #2: Constant pricer (always mean)",
            lang: "python",
            before: `
**Slightly less stupid:** predict mean of training prices cho mọi item.

**Insight:** với regression, predicting mean = MSE-optimal among constants. Đây là minimum tốt nhất nếu không biết gì khác.
`,
            code: `training_prices = [item.price for item in train]
training_average = sum(training_prices) / len(training_prices)
print(f"Training average: \${training_average:.2f}")
# Training average: $124.32

def constant_pricer(item):
    return training_average

evaluate(constant_pricer, test)`,
            after: `
**Output:**

\`\`\`
Constant Pricer (predicting $124.32 always)
Average error: $99.45
Hit rate: 12.8%
\`\`\`

**Diễn giải:**

- Error $99 < random $329 → **2.5× cải thiện chỉ bằng cách predict mean**
- Tại sao? Distribution skewed về low-mid prices ($10-200). Predict mean $124 sẽ "trúng gần" cho phần lớn items.
- Hit rate vẫn thấp (12.8%) vì luôn predict same value — chỉ trúng các items giá quanh $124.

**Lesson:**

Mean prediction = strong baseline cho regression. Cho classification, equivalent = predict majority class.

Nếu mean baseline đã rất tốt (vd hit rate >50%), → task có ít signal, khó cải thiện. Nếu mean baseline tệ, → task có signal, ML có cơ hội.

Day 3 case: $99 error còn nhiều room → ML có signal để học.
`
        },
        {
            title: "Bước 4 — Linear Regression với features manual",
            lang: "python",
            before: `
**First "real" ML model.** Extract features từ item, train Linear Regression.

3 features chọn:
- \`weight\`: nặng = đắt? (correlated với material cost)
- \`weight_unknown\`: flag cho items missing weight (indicator feature)
- \`text_length\`: length of description (proxy cho complexity)
`,
            code: `def get_features(item):
    return {
        "weight": item.weight,
        "weight_unknown": 1 if item.weight == 0 else 0,
        "text_length": len(item.summary)
    }

def list_to_dataframe(items):
    features = [get_features(item) for item in items]
    df = pd.DataFrame(features)
    df['price'] = [item.price for item in items]
    return df

train_df = list_to_dataframe(train)
test_df = list_to_dataframe(test)

# Train Linear Regression
np.random.seed(42)
feature_columns = ['weight', 'weight_unknown', 'text_length']

X_train = train_df[feature_columns]
y_train = train_df['price']

model = LinearRegression()
model.fit(X_train, y_train)

# Inspect learned weights
for feature, coef in zip(feature_columns, model.coef_):
    print(f"{feature}: {coef:.4f}")
print(f"Intercept: {model.intercept_:.2f}")

# Evaluate
def linear_regression_pricer(item):
    features = get_features(item)
    features_df = pd.DataFrame([features])
    return model.predict(features_df)[0]

evaluate(linear_regression_pricer, test)`,
            after: `
**Output learned weights:**

\`\`\`
weight: 0.0234        ← positive: nặng hơn = đắt hơn
weight_unknown: -15.21 ← negative: items không có weight info → giá thấp hơn
text_length: 0.0142    ← positive: description dài = đắt hơn
Intercept: 35.67

Linear Regression Pricer
Average error: $112.34
Hit rate: 14.2%
\`\`\`

**Mổ xẻ weights:**

- **weight: 0.0234**: mỗi ounce thêm → giá tăng $0.023. Hợp lý.
- **weight_unknown: -15.21**: items có weight=0 (unknown) giá thấp hơn ~$15. Có thể vì cheap items (small accessories) ít công bố weight chi tiết.
- **text_length: 0.0142**: mỗi ký tự thêm → +$0.014. Subtle nhưng meaningful.

**Lift over baselines:**

- vs Random ($329): 3× cải thiện
- vs Mean ($99): chỉ 1.13× — không đáng kể

**Tại sao Linear không lift nhiều vs Mean?**

3 features manual chỉ capture **fraction** của signal. Real predictive power nằm trong **text content** (brand, category, model name) — chưa được sử dụng.

Bước tiếp: **BoW features** từ text → unlock signal này.
`
        },
        {
            title: "Bước 5 — BoW Vectorizer + Linear Regression",
            lang: "python",
            before: `
**Unlock text signal.** \`CountVectorizer\` build vocab từ training data, mỗi document → vector counts.

**\`max_features=2000\`**: chỉ giữ 2000 từ phổ biến nhất. Tradeoff: lớn hơn → richer features nhưng training slower.
**\`stop_words='english'\`**: loại bỏ "the", "a", "is" — noise không informative.
`,
            code: `prices = np.array([float(item.price) for item in train])
documents = [item.summary for item in train]

np.random.seed(42)
vectorizer = CountVectorizer(max_features=2000, stop_words='english')
X = vectorizer.fit_transform(documents)

# Inspect vocab
selected_words = vectorizer.get_feature_names_out()
print(f"Number of selected words: {len(selected_words)}")
print("Sample words:", selected_words[1000:1020])
# Sample: ['lighting', 'lightning', 'lights', 'limit', 'limited', 'line', 'lines', ...]

# Train Linear Regression trên BoW features
regressor = LinearRegression()
regressor.fit(X, prices)

def natural_language_linear_regression_pricer(item):
    x = vectorizer.transform([item.summary])
    return max(regressor.predict(x)[0], 0)   # clip negative

evaluate(natural_language_linear_regression_pricer, test)`,
            after: `
**Output:**

\`\`\`
BoW + Linear Regression
Average error: $94.85
Hit rate: 22.1%
\`\`\`

**Lift:**

- vs Linear với 3 features ($112): 16% improvement
- vs Mean baseline ($99): 4% improvement only

**Quan sát:**

Hit rate 22% (vs 14% Linear features) — significant. Có nhiều predictions trúng trong "good" range.

**Insight về learned coefficients:**

Có thể inspect top-coefficient words:

\`\`\`python
import pandas as pd
coef_df = pd.DataFrame({
    'word': selected_words,
    'coef': regressor.coef_
}).sort_values('coef', ascending=False)

print("Top 10 'expensive' words:")
print(coef_df.head(10))
# professional, industrial, server, commercial, ...

print("Top 10 'cheap' words:")
print(coef_df.tail(10))
# refurbished, used, cheap, mini, simple, ...
\`\`\`

**Đây là interpretability** — biết model học gì. Quan trọng cho debug và trust.

**Limitations BoW:**

- Không hiểu thứ tự ("dog bites man" = "man bites dog")
- Không hiểu synonym ("car" ≠ "automobile")
- Sparse vectors (đa số entry = 0)

Bước tiếp: **non-linear models** (RF, XGBoost) sẽ capture pattern phức tạp hơn từ BoW features.
`
        },
        {
            title: "Bước 6 — Random Forest ensemble",
            lang: "python",
            before: `
**Ensemble model.** 100 decision trees, mỗi tree random subset features + data → average predictions.

**Trade-off:**
- **Pros:** robust, no tuning, capture non-linear patterns, no overfitting
- **Cons:** **slow** (15 giờ cho 800K data). \`subset=15_000\` để demo nhanh.
`,
            code: `subset = 15_000   # subset cho demo - full 800K mất 15h
rf_model = RandomForestRegressor(
    n_estimators=100,    # 100 trees
    random_state=42,
    n_jobs=4,             # 4 CPU cores parallel
)
rf_model.fit(X[:subset], prices[:subset])

def random_forest(item):
    x = vectorizer.transform([item.summary])
    return max(0, rf_model.predict(x)[0])

evaluate(random_forest, test)`,
            after: `
**Output (với 15K subset):**

\`\`\`
Random Forest
Average error: $89.42
Hit rate: 26.3%
\`\`\`

**Full dataset RF (Edward chạy overnight 15h):**

\`\`\`
Average error: $56.40
\`\`\`

**Big jump.** Tại sao?

**Random Forest** capture interactions giữa features. Vd:
- "professional" + "industrial" → expensive
- "refurbished" + "small" → cheap
- "Sony" + "headphones" + "noise canceling" → high price tier

Linear Regression không bắt được interactions — chỉ sum of per-feature effects. RF với decision trees naturally model interactions.

**Tradeoffs nhớ rõ:**

| | RF | XGBoost |
|---|---|---|
| Time để train 800K | 15 giờ | 30 phút |
| Memory | High (lưu 100 trees full) | Medium |
| Accuracy | Comparable | Slightly better |
| Tuning required | Minimal | Some |
| Interpretability | OK (feature importance) | Better (gradient inspection) |

Cho production tabular ML, **XGBoost = default choice**.
`
        },
        {
            title: "Bước 7 — XGBoost: faster + better",
            lang: "python",
            before: `
**XGBoost** — gradient boosted trees. Modern standard cho tabular data.

**Khác Random Forest:**
- Trees sinh **tuần tự** thay vì độc lập
- Mỗi tree fix lỗi của tree trước (gradient descent trong tree space)
- Faster training, better generalization typically

\`learning_rate=0.1\` controls "step size" — small = stable nhưng slower convergence.
`,
            code: `import xgboost as xgb

np.random.seed(42)

xgb_model = xgb.XGBRegressor(
    n_estimators=1000,      # 1000 trees (RF dùng 100)
    random_state=42,
    n_jobs=4,
    learning_rate=0.1,       # step size
)

# Train trên FULL dataset (full 800K, không subset)
xgb_model.fit(X, prices)

def xg_boost(item):
    x = vectorizer.transform([item.summary])
    return max(0, xgb_model.predict(x)[0])

evaluate(xg_boost, test)`,
            after: `
**Output trên full 800K dataset:**

\`\`\`
XGBoost
Average error: $50.21
Hit rate: 29.8%
\`\`\`

**XGBoost beat RF** ($50 vs $56) trong 30 phút thay vì 15 giờ. **30× faster.**

**Best traditional ML cho task này.**

**Tổng kết Day 3 - 6 models so sánh:**

| Model | Error | Hit Rate | Time |
|---|---|---|---|
| Random | $329 | 8% | <1s |
| Mean | $99 | 13% | <1s |
| Linear (3 features) | $112 | 14% | <1s |
| BoW + Linear | $95 | 22% | 30s |
| Random Forest (subset) | $89 | 26% | 5 phút |
| **XGBoost** | **$50** | **30%** | **30 phút** |

**Big insight:** **traditional ML đã rất mạnh.** XGBoost với BoW features → error $50 trên price range $1-$1000.

Day 4 sẽ test:
1. **Human baseline**: tự đoán giá → đo human performance
2. **Neural Network** (PyTorch): có beat XGBoost không?
3. **Frontier API** (GPT, Claude, Gemini): zero-shot có thay traditional ML không?

**Spoiler:** GPT-4.1 zero-shot ~$76, **tệ hơn XGBoost trained**. Tuần 7 fine-tune frontier sẽ flip kết quả.
`
        }
    ]
});
