window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 5,
    day: 2,
    title: "Chunking · Embeddings · Chroma DB · t-SNE Visualization",
    notebooks: ["week5/day2.ipynb"],
    topics: [
        "DirectoryLoader + TextLoader để load nhiều files",
        "RecursiveCharacterTextSplitter chunking",
        "HuggingFaceEmbeddings (all-MiniLM-L6-v2) — free local embedding",
        "Chroma DB — vector store persistent",
        "t-SNE giảm chiều 384D → 2D/3D để visualize",
        "Plotly 3D interactive scatter"
    ],
    summary: `
## 1. Pipeline Tuần 5 Day 2 — 3 phần

\`\`\`
PART A: Documents → Chunks       (RecursiveCharacterTextSplitter)
PART B: Chunks → Vector Store    (Embeddings + Chroma)
PART C: Visualize                (t-SNE + Plotly)
\`\`\`

## 2. Tại sao chunking?

Documents thô có thể rất dài (vài chục KB). Vấn đề:
- **Embedding context limit**: most models <512 tokens
- **Vector 'trung bình hóa' meaning** nếu chunk quá to → search miss specifics
- **Retrieve cả document → ngốn context window khi gửi LLM**

Chia thành **chunks** (~500-1000 chars), embed mỗi chunk riêng. Search top-k chunks thay vì full doc.

## 3. Embedding models

| Model | Provider | Dimensions | Cost |
|---|---|---|---|
| \`all-MiniLM-L6-v2\` | HuggingFace | 384 | **Free** (chạy local) |
| \`text-embedding-3-small\` | OpenAI | 1536 | $0.02/M tokens |
| \`text-embedding-3-large\` | OpenAI | 3072 | $0.13/M tokens |
| \`bge-large-en-v1.5\` | BAAI | 1024 | Free local |

Day 2 chọn **\`all-MiniLM-L6-v2\`** vì:
- Free, chạy local trên CPU/GPU
- Nhỏ (~80MB)
- Đủ tốt cho task này

## 4. Chroma — vector DB

- **Local-first**: file SQLite + parquet, không cần server
- **Python-native**: \`pip install chromadb\`
- **Persistent**: lưu vào disk, restart vẫn còn

LangChain wrap Chroma → 1 dòng tạo vectorstore.

## 5. t-SNE visualization

Vectors 384 chiều không vẽ trực tiếp được. **t-SNE** project xuống 2D/3D giữ relative distance.

Mục đích visualize:
- Verify clusters có form đúng (employees, products tách biệt)
- Spot outliers (chunks rời rạc, possibly misplaced)
- Demo "tại sao embedding work"
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho chunking:** Coi như đóng gói hành lý. Quá nặng (chunk lớn) khó tìm. Quá nhỏ (chunk vụn) mất ngữ cảnh. Cân bằng là nghệ thuật — chunk_size 500-1000 với overlap 100-200 là sweet spot."
        },
        {
            type: "warn",
            text: "**Embedding model phải nhất quán giữa indexing và query.** Tạo vector DB với model A → search phải dùng model A. Mix model → garbage results."
        }
    ],
    keyPoints: [
        "**Chunk size là hyperparameter quan trọng nhất.** Quá nhỏ → mất context. Quá lớn → 'noise' trong vector. Sweet spot 300-800 tokens.",
        "**Overlap 10-20% chunk_size** đảm bảo không cắt mất context biên. Quá nhiều overlap → tốn storage và duplicate trong top-k.",
        "**HuggingFace embedding free vs OpenAI paid.** Free đủ tốt cho ~80% use case. OpenAI tốt hơn cho task nuance, đa ngôn ngữ.",
        "**Chroma persistent qua restarts.** Set \`persist_directory=...\` → DB lưu trên disk, không phải in-memory.",
        "**\`delete_collection()\` trước khi recreate.** Tránh duplicate data khi rerun cell.",
        "**t-SNE không bảo toàn distance tuyệt đối.** Cluster gần trên 2D plot không nhất thiết gần trong 384D. Chỉ dùng để visualize clustering."
    ],
    code: [
        {
            title: "Bước 1 — Setup imports cho LangChain RAG stack",
            lang: "python",
            before: `
**Bộ libraries cho RAG.** LangChain wrap tất cả: document loaders, splitters, embeddings, vector stores.

**HuggingFaceEmbeddings** chạy local — không cần API key. **OpenAIEmbeddings** dùng API. Notebook show cả 2 cách, commented:
`,
            code: `import os
import glob
import tiktoken
import numpy as np
from dotenv import load_dotenv

# LangChain components
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Visualization
from sklearn.manifold import TSNE
import plotly.graph_objects as go

MODEL = "gpt-4.1-nano"
db_name = "vector_db"
load_dotenv(override=True)`,
            after: `
**Mổ xẻ packages:**

- **\`langchain_openai\`**: wrapper OpenAI cho embeddings + chat (LangChain interface)
- **\`langchain_chroma\`**: Chroma vector DB integration
- **\`langchain_huggingface\`**: HF embeddings integration
- **\`langchain_community\`**: community loaders (filesystem, web, PDF...)
- **\`langchain_text_splitters\`**: chunking strategies

LangChain v1.0 modular hơn v0.x — mỗi integration là package riêng để giảm bloat.

**\`tiktoken\`**: count tokens chính xác cho OpenAI models. Day 2 dùng để estimate cost trước khi gọi embedding API.

**\`sklearn.manifold.TSNE\`**: dimensionality reduction algorithm. Sklearn built-in.

**\`plotly.graph_objects\`**: interactive plots, hover, zoom. Better than matplotlib cho data exploration.
`
        },
        {
            title: "Bước 2 — Load tất cả markdown files với DirectoryLoader",
            lang: "python",
            before: `
**Pattern load directory với LangChain.**

\`DirectoryLoader\` recursive scan folder, apply \`TextLoader\` cho mỗi file match glob pattern. Output: list of \`Document\` objects với \`page_content\` + \`metadata\`.

**Custom metadata:** add \`doc_type\` cho mỗi document — sẽ dùng để filter và visualize.
`,
            code: `folders = glob.glob("knowledge-base/*")

documents = []
for folder in folders:
    doc_type = os.path.basename(folder)    # "employees", "products", etc.
    loader = DirectoryLoader(
        folder,
        glob="**/*.md",                     # recursive, all .md files
        loader_cls=TextLoader,
        loader_kwargs={'encoding': 'utf-8'},
    )
    folder_docs = loader.load()
    for doc in folder_docs:
        doc.metadata["doc_type"] = doc_type  # tag mỗi doc với type
        documents.append(doc)

print(f"Loaded {len(documents)} documents")
# Loaded 31 documents

# Inspect 1 document
print(documents[1])
# Document(
#   metadata={'source': 'knowledge-base/products/Carllm.md', 'doc_type': 'products'},
#   page_content='# Carllm\\n\\nCarllm is an...'
# )`,
            after: `
**Mổ xẻ Document object:**

- **\`page_content\`** (str): text content của file
- **\`metadata\`** (dict): info về source. LangChain auto-add \`source\` (file path). Bạn add custom field như \`doc_type\`.

**Tại sao metadata quan trọng:**

- **Filter**: \`retriever.invoke(query, filter={"doc_type": "products"})\` chỉ search trong products
- **Display**: hiển thị source cho user "Source: products/Carllm.md"
- **Routing**: dispatch query về sub-collection theo type

**Pattern \`doc_type\`:** "tag" để partition data. Production thường thêm:
- \`created_at\`: timestamp
- \`author\`: ai viết
- \`access_level\`: public/internal/confidential
- \`version\`: version control

Càng nhiều metadata → càng nhiều control sau.
`
        },
        {
            title: "Bước 3 — Chunking với RecursiveCharacterTextSplitter",
            lang: "python",
            before: `
**Chia documents thành chunks.** \`RecursiveCharacterTextSplitter\` thử cắt theo paragraph trước, fallback xuống newline, fallback xuống character.

**Default separators**: \`["\\n\\n", "\\n", " ", ""]\` — paragraph → line → word → char.
`,
            code: `text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,         # max ký tự per chunk
    chunk_overlap=200,       # overlap giữa chunks
)
chunks = text_splitter.split_documents(documents)

print(f"Divided into {len(chunks)} chunks")

# Inspect 1 chunk
print(chunks[100])
# Document(
#   metadata={'source': 'knowledge-base/products/Markellm.md', 'doc_type': 'products'},
#   page_content='## Pricing\\n\\nOur tiered pricing model...'
# )`,
            after: `
**Mổ xẻ tham số:**

- **\`chunk_size=1000\`**: target size mỗi chunk (ký tự, không phải tokens). Vì check char count → predictable hơn token-based.
- **\`chunk_overlap=200\`**: 20% overlap. Đảm bảo context biên không bị mất.

**Tại sao "Recursive"?**

Splitter thử **lần lượt** các separator:

1. Thử cắt theo \`\\n\\n\` (paragraph). Nếu kết quả ≤ chunk_size → done.
2. Nếu chunk vẫn quá to → recursive vào chunk lớn → thử \`\\n\` (line).
3. Vẫn quá to → thử \` \` (word).
4. Cuối cùng → cắt giữa từ (rare).

**Hệ quả:** chunks tự nhiên cắt theo "boundary có nghĩa" (paragraph, line) thay vì giữa câu.

**Kết quả:** 31 documents → ~120 chunks. Avg chunk ~700 chars. Đủ context per chunk, không quá to để mất specifics.

**Customize separators:** với code, dùng \`["\\nclass ", "\\ndef ", "\\n\\n", ...]\`. Với markdown, \`["\\n# ", "\\n## ", ...]\`. Splitter sẽ ưu tiên cắt theo structure.
`
        },
        {
            title: "Bước 4 — Embeddings model: HuggingFace free local",
            lang: "python",
            before: `
**Embedding step — biến chunks thành vectors.**

\`all-MiniLM-L6-v2\` từ Sentence-Transformers:
- 80MB, chạy local
- 384 dimensions output
- Trained on 1B+ sentence pairs
- Performance gần OpenAI embeddings cho most task

Tradeoff: chậm hơn (CPU vs GPU API), quality nhỏ hơn cho task niche.
`,
            code: `# Chọn embedding model (uncomment cái muốn dùng)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
# embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

# Test embedding 1 sample
sample_text = "Avery Lancaster is the founder"
sample_vec = embeddings.embed_query(sample_text)
print(f"Vector dimension: {len(sample_vec)}")    # 384

# Embed batch
sample_vecs = embeddings.embed_documents([
    "Avery Lancaster is the founder",
    "Carllm is a car insurance product"
])
print(f"Batch shape: {len(sample_vecs)} × {len(sample_vecs[0])}")`,
            after: `
**Mổ xẻ:**

- **\`embed_query()\`**: embed 1 text (cho search query)
- **\`embed_documents()\`**: embed batch (cho indexing). Optimized.

**Tại sao tách 2 methods:**

Một số embedding models train với **2 task khác nhau**:
- Query-style: ngắn, có "?" mark
- Document-style: dài, declarative

Sentence-Transformers thường dùng cùng model cho cả 2 — methods identical. Nhưng OpenAI có version riêng (\`text-embedding-3-small\` for both, hoặc model riêng cho query vs doc).

**Performance HuggingFace local:**

- CPU: ~50 chunks/giây
- GPU (T4): ~500 chunks/giây
- 120 chunks → vài giây trên CPU, không cần GPU

**OpenAI API tốc độ tương đương** nhưng tốn $0.02/M tokens. Cho 120 chunks × 700 chars ≈ 21K tokens → $0.0004. Marginal cost gần 0 — vấn đề privacy nhiều hơn cost.
`
        },
        {
            title: "Bước 5 — Tạo Chroma vector store",
            lang: "python",
            before: `
**Magic moment.** LangChain wrap Chroma thành 1 dòng — pass documents + embeddings + persist path → done.

**Cảnh báo recreate:** Chroma persistent → nếu rerun cell, data sẽ duplicate. Pattern: delete collection cũ trước khi tạo mới.
`,
            code: `# Delete collection cũ nếu tồn tại (tránh duplicate)
if os.path.exists(db_name):
    Chroma(persist_directory=db_name, embedding_function=embeddings).delete_collection()

# Tạo mới
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory=db_name,
)
print(f"Vectorstore created with {vectorstore._collection.count()} documents")
# Vectorstore created with 123 documents

# Investigate vectors
collection = vectorstore._collection
sample_embedding = collection.get(limit=1, include=["embeddings"])["embeddings"][0]
dimensions = len(sample_embedding)
print(f"There are {collection.count():,} vectors with {dimensions:,} dimensions")
# There are 123 vectors with 384 dimensions`,
            after: `
**Mổ xẻ:**

1. **\`Chroma.from_documents(...)\`**: helper factory method:
   - Loop qua documents → embed mỗi chunk → store vector + text + metadata
   - Auto-create collection trong DB
   - Returns Chroma object ready để query

2. **\`persist_directory\`**: folder để save vectors. Restart Python → load lại bằng \`Chroma(persist_directory=db_name)\` không cần re-embed.

3. **\`vectorstore._collection\`**: access underlying Chroma collection object. Useful cho inspect.

**File structure sau khi tạo:**

\`\`\`
vector_db/
├── chroma.sqlite3              # metadata + ids
├── <uuid>/
│   ├── data_level0.bin         # vectors binary
│   ├── header.bin
│   └── ...
\`\`\`

**Query test:**

\`\`\`python
results = vectorstore.similarity_search("Who is the CEO?", k=3)
for r in results:
    print(r.metadata['source'], '|', r.page_content[:100])
# knowledge-base/employees/CEO Avery Lancaster.md | # Avery Lancaster\\n## Summary\\n...
\`\`\`

**Magic:** \`Who is the CEO?\` không xuất hiện trong key, nhưng vector embedding hiểu **semantic** — biết Avery Lancaster là CEO từ content.

Đây là điều brute-force Day 1 không làm được.
`
        },
        {
            title: "Bước 6 — t-SNE visualization 2D",
            lang: "python",
            before: `
**Visualize vectors 384D xuống 2D.** t-SNE preserve clustering tốt — points gần nhau trong 384D sẽ gần nhau trên 2D plot.

**Mục đích:** verify embeddings tạo clusters hợp lý (employees ≠ products ≠ contracts).
`,
            code: `# Pre-work: lấy vectors + metadata
result = collection.get(include=['embeddings', 'documents', 'metadatas'])
vectors = np.array(result['embeddings'])
documents = result['documents']
metadatas = result['metadatas']

# Map doc_type → color
doc_types = [m['doc_type'] for m in metadatas]
colors = [
    ['blue', 'green', 'red', 'orange'][['products', 'employees', 'contracts', 'company'].index(t)]
    for t in doc_types
]

# Reduce 384D → 2D với t-SNE
tsne = TSNE(n_components=2, random_state=42)
reduced_vectors = tsne.fit_transform(vectors)

# Plotly scatter
fig = go.Figure(data=[go.Scatter(
    x=reduced_vectors[:, 0],
    y=reduced_vectors[:, 1],
    mode='markers',
    marker=dict(size=5, color=colors, opacity=0.8),
    text=[f"Type: {t}<br>Text: {d[:100]}..." for t, d in zip(doc_types, documents)],
    hoverinfo='text',
)])

fig.update_layout(title='2D Chroma Vector Store Visualization', width=800, height=600)
fig.show()`,
            after: `
**Output:** plot 2D với 4 cluster màu — products (blue), employees (green), contracts (red), company (orange).

**Quan sát điển hình:**

- **Clusters tách biệt rõ ràng** → embedding model phân biệt được doc types
- **Products gần company** (về business context)
- **Employees có sub-cluster** (CEO, engineer, support — tách bộ phận)
- **Outliers** = chunks chứa nội dung cross-domain (vd contract mention cả product) → nằm giữa 2 clusters

**Tại sao quan trọng:**

1. **Sanity check** embedding model — clusters không form → model không hiểu data
2. **Spot mislabeled docs** — chunk green nằm trong cluster red → có thể content sai folder
3. **Demo cho stakeholders** — visual proof "AI hiểu data của chúng ta"

**\`random_state=42\`**: t-SNE có random component. Fix seed → result reproducible mỗi run.

**Hover text:** Plotly hỗ trợ rich hover. Click vào point → preview chunk content. Rất hữu ích để explore data lớn.
`
        },
        {
            title: "Bước 7 — t-SNE 3D — góc nhìn rộng hơn",
            lang: "python",
            before: `
**Upgrade: 3D plot.** Mỗi cluster có thể overlap trong 2D nhưng tách trong 3D. \`Scatter3d\` cho rotation interactive.
`,
            code: `tsne = TSNE(n_components=3, random_state=42)
reduced_vectors = tsne.fit_transform(vectors)

fig = go.Figure(data=[go.Scatter3d(
    x=reduced_vectors[:, 0],
    y=reduced_vectors[:, 1],
    z=reduced_vectors[:, 2],
    mode='markers',
    marker=dict(size=5, color=colors, opacity=0.8),
    text=[f"Type: {t}<br>Text: {d[:100]}..." for t, d in zip(doc_types, documents)],
    hoverinfo='text',
)])

fig.update_layout(
    title='3D Chroma Vector Store Visualization',
    scene=dict(xaxis_title='x', yaxis_title='y', zaxis_title='z'),
    width=900, height=700,
)
fig.show()`,
            after: `
**Output:** 3D scatter interactive — click-drag để rotate, scroll để zoom.

**Tại sao 3D > 2D cho debug:**

Trong 2D, có thể 2 cluster lay nhau ở 1 angle. Rotate 3D thấy chúng tách biệt trong dimension thứ 3.

**Limitation t-SNE:**

- **Computational expensive**: O(N²). 10K vectors → vài phút. 100K → impractical.
- **Không bảo toàn global structure**: distance giữa 2 cluster không có meaning. Chỉ "within cluster" preserve.
- **Hyperparameter sensitive**: \`perplexity\` default 30, có thể cần tune cho data lớn/nhỏ.

**Alternatives nhanh hơn:**
- **UMAP**: similar quality, ~10× faster
- **PCA**: linear, very fast, nhưng less effective cho non-linear data
- **Embedding projector** (TensorBoard): interactive 3D, dùng PCA + t-SNE + UMAP

**Production:** t-SNE chỉ cho one-time visualize. Production monitoring → dùng PCA cho speed.
`
        }
    ]
});
