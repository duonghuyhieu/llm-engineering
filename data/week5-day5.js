window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 5,
    day: 5,
    title: "Advanced RAG · LLM-based Chunking · Re-ranking · Query Rewriting · Beyond LangChain",
    notebooks: ["week5/day5.ipynb"],
    topics: [
        "Build RAG without LangChain — pure Python + Chroma",
        "LLM-based semantic chunking với Pydantic",
        "Document pre-processing: headline + summary + original",
        "Re-ranking với LLM-as-judge",
        "Query rewriting cho conversational RAG",
        "OpenAI text-embedding-3-large cho quality cao"
    ],
    summary: `
## 1. Day 5 — Pro version

Day 1-4 build RAG với LangChain (high-level abstraction). Day 5 **rewrite without LangChain** để có:
- **Full control**: mỗi step explicit
- **Better visibility**: log mọi LLM call
- **Easy customize**: insert custom logic mọi đâu

Pattern: code direct với \`openai\` client + \`chromadb\` Python — không cần framework wrapper.

## 2. 3 advanced techniques

**Technique 1: LLM-based chunking**

Day 2 dùng RecursiveCharacterTextSplitter — cắt theo ký tự. Day 5: **LLM tự chia chunks** với:
- \`headline\`: vài từ summarize chunk
- \`summary\`: vài câu summary
- \`original_text\`: text gốc

Embed concatenation của 3 fields → vector representation phong phú hơn raw text.

**Technique 2: Re-ranking**

\`\`\`
fetch_context_unranked() → 10 chunks initial
   ↓ rerank() — LLM judge relevance
3 chunks top
\`\`\`

LLM được 10 chunks + question → trả về list ids ordered by relevance. Đây là **cross-encoder pattern** — LLM "nhìn" cả query và chunk cùng lúc.

**Technique 3: Query rewriting**

User hỏi "Tell me more" → context-dependent. RAG cần **rewrite** thành standalone query trước khi search.

\`\`\`
History: "What is Carllm?" / Bot: "Car insurance..."
Current: "How much does it cost?"
   ↓ rewrite_query()
"Carllm pricing"
   ↓ search
Relevant chunks
\`\`\`

## 3. Đo improvement

Đặt re-rank + query rewrite → MRR tăng từ 0.73 → 0.91 (theo experiment Edward). Big lift.

## 4. Beyond LangChain — khi nào tự build

LangChain tốt cho:
- Prototype nhanh
- Standard pattern (vanilla RAG, simple chains)

Self-build tốt cho:
- Production scale, debugging quan trọng
- Custom logic không fit LangChain abstraction
- Khi LangChain version breaks compat (xảy ra thường)

**Quy tắc:** prototype với LangChain → khi rõ pattern, refactor sang custom code → maintain ổn định.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho 2-stage retrieval:** Coi như tuyển dụng. Stage 1 (dense retrieval) = sàng lọc CV — nhanh, lấy 20 ứng viên. Stage 2 (re-rank) = phỏng vấn — chậm, sâu, chọn 5 finalist. Cả 2 stage cần thiết, vai trò khác nhau."
        },
        {
            type: "warn",
            text: "**Đừng cộng dồn complexity.** Mỗi technique (chunking LLM, re-rank, query rewrite) đều có lift riêng — nhưng cộng tất cả chưa chắc tốt hơn. Test từng cái riêng, chỉ giữ những cái thực sự lift trên data của bạn."
        }
    ],
    keyPoints: [
        "**LLM-based chunking** lift retrieval đáng kể vì headline + summary đóng vai trò 'keywords' giúp embedding capture meaning tốt hơn.",
        "**Re-ranking là ROI cao nhất.** 1 LLM call thêm rerank top-20 → kết quả top-5 chất lượng hẳn.",
        "**Query rewriting bridge conversational gap.** Không có nó, follow-up question fail vì lack context.",
        "**\`text-embedding-3-large\` (3072 dim) cho quality cao** so với \`all-MiniLM-L6-v2\` (384 dim). Đổi cho production-grade.",
        "**Pydantic structured output cho LLM calls** = type-safe + parse free.",
        "**LangChain prototype, custom production** là pattern phổ biến. Đừng ép everything vào framework."
    ],
    code: [
        {
            title: "Bước 1 — Setup pro implementation",
            lang: "python",
            before: `
**Pro setup khác basic ở:**
- \`PersistentClient\` của Chroma (không qua LangChain wrapper)
- \`text-embedding-3-large\` (3072 dim, OpenAI) thay HF MiniLM
- Custom data classes với Pydantic
- LiteLLM cho LLM (alternative client với multi-provider support)
`,
            code: `from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from chromadb import PersistentClient
from tqdm import tqdm
from litellm import completion
import numpy as np

load_dotenv(override=True)

MODEL = "gpt-4.1-nano"
DB_NAME = "preprocessed_db"
collection_name = "docs"
embedding_model = "text-embedding-3-large"   # 3072 dim, OpenAI
KNOWLEDGE_BASE_PATH = Path("knowledge-base")
AVERAGE_CHUNK_SIZE = 500

openai = OpenAI()

# Custom Result class (giống LangChain Document)
class Result(BaseModel):
    page_content: str
    metadata: dict

# Class representing 1 chunk với enriched fields
class Chunk(BaseModel):
    headline: str = Field(description="Brief heading, a few words")
    summary: str = Field(description="Few sentences summarizing")
    original_text: str = Field(description="Original text, exactly as is")

    def as_result(self, document):
        metadata = {"source": document["source"], "type": document["type"]}
        return Result(
            page_content=self.headline + "\\n\\n" + self.summary + "\\n\\n" + self.original_text,
            metadata=metadata,
        )

class Chunks(BaseModel):
    chunks: list[Chunk]`,
            after: `
**Mổ xẻ design:**

**\`Chunk\` class với 3 fields:**

- **\`headline\`**: 5-10 từ. Đóng vai trò "title" — boost search.
- **\`summary\`**: 2-3 câu. Bridge between query intent và raw text.
- **\`original_text\`**: exact text từ document. Đảm bảo không mất info.

**\`as_result()\`** ghép 3 fields thành single string cho embedding:

\`\`\`
"Q1 Performance Review

The quarterly review covered revenue growth and engineering capacity.

[Original chunk text here...]"
\`\`\`

**Tại sao headline + summary giúp:**

User query "growth metrics" → embedding match với **summary** chứa "revenue growth" tốt hơn so với raw text dài chứa từ "growth" ở giữa.

Đây là **query-aware document representation** — chunks được pre-process để dễ retrieve hơn.

**\`Chunks\` wrapper class:** Pydantic structured output cần root model. LLM trả \`{"chunks": [...]}\` → \`Chunks.model_validate_json()\` parse.

**\`text-embedding-3-large\`** vs \`all-MiniLM-L6-v2\`:

| | MiniLM | text-embedding-3-large |
|---|---|---|
| Dimensions | 384 | 3072 |
| Quality | Decent | Top-tier |
| Cost | Free local | $0.13/M tokens |
| Speed | Fast | Slow (API call) |

Production thường \`large\` cho indexing (1 lần), \`small\` cho query (mỗi request) để balance.
`
        },
        {
            title: "Bước 2 — LLM-based semantic chunking với prompt",
            lang: "python",
            before: `
**Replace RecursiveCharacterTextSplitter** bằng LLM chia chunks "intelligent". LLM hiểu structure document (sections, paragraphs, topics) → cắt boundary có meaning.

**\`how_many\`** estimate số chunks based on \`AVERAGE_CHUNK_SIZE\`. LLM nhận hint nhưng có thể adjust.
`,
            code: `def make_prompt(document):
    how_many = (len(document["text"]) // AVERAGE_CHUNK_SIZE) + 1
    return f"""
You take a document and you split the document into overlapping chunks for a KnowledgeBase.

The document is from the shared drive of a company called Insurellm.
The document is of type: {document["type"]}
The document has been retrieved from: {document["source"]}

A chatbot will use these chunks to answer questions about the company.
You should divide up the document as you see fit, being sure that the entire document is returned in the chunks - don't leave anything out.
This document should probably be split into {how_many} chunks, but you can have more or less as appropriate.
There should be overlap between the chunks as appropriate; typically about 25% overlap or about 50 words.

For each chunk, you should provide a headline, a summary, and the original text of the chunk.
Together your chunks should represent the entire document with overlap.

Here is the document:

{document["text"]}

Respond with the chunks.
"""

def process_document(document):
    messages = [{"role": "user", "content": make_prompt(document)}]
    response = completion(model=MODEL, messages=messages, response_format=Chunks)
    reply = response.choices[0].message.content
    doc_as_chunks = Chunks.model_validate_json(reply).chunks
    return [chunk.as_result(document) for chunk in doc_as_chunks]`,
            after: `
**Mổ xẻ prompt design:**

- **Context** ("from Insurellm shared drive", doc type, source) → LLM hiểu domain
- **Goal** ("chatbot will use these chunks") → LLM optimize cho retrieval
- **Constraint** ("entire document returned, don't leave anything out") → no info loss
- **Guideline** ("about {how_many} chunks, 25% overlap, 50 words") → consistency
- **Output spec** ("headline + summary + original_text") → enrich representation

**\`response_format=Chunks\`** ép LLM trả JSON match Pydantic schema. Type-safe, không parse fail.

**Trade-off LLM chunking vs character splitter:**

| | RecursiveCharacterTextSplitter | LLM-based |
|---|---|---|
| Speed | <1s cho 100 docs | ~10s per doc |
| Cost | $0 | ~$0.001 per doc |
| Quality | Good | Tốt hơn (semantic boundary) |
| Determinism | 100% | LLM có thể vary |

**Khi nào dùng LLM chunking:**

- ✅ Knowledge base nhỏ (<1000 docs), index 1 lần
- ✅ Document structured (sections, headers) — LLM identify được
- ✅ Quality > speed
- ❌ Streaming ingestion (mỗi doc tốn 10s)
- ❌ Million-doc corpus

**Pattern hybrid:** dùng character splitter cho 90% docs (fast), LLM splitter cho 10% high-priority docs (key contracts, FAQ).
`
        },
        {
            title: "Bước 3 — Create embeddings với batch OpenAI",
            lang: "python",
            before: `
**Embed chunks và store vào Chroma manually** — không qua LangChain wrapper.

**Pattern batching:** \`openai.embeddings.create(input=[list of texts])\` — gửi 1 request, get nhiều vectors. Hiệu quả hơn N requests.
`,
            code: `def create_embeddings(chunks):
    chroma = PersistentClient(path=DB_NAME)
    if collection_name in [c.name for c in chroma.list_collections()]:
        chroma.delete_collection(collection_name)

    # Extract texts
    texts = [chunk.page_content for chunk in chunks]

    # Batch embed
    emb = openai.embeddings.create(model=embedding_model, input=texts).data
    vectors = [e.embedding for e in emb]

    # Store
    collection = chroma.get_or_create_collection(collection_name)
    ids = [str(i) for i in range(len(chunks))]
    metas = [chunk.metadata for chunk in chunks]

    collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metas)
    print(f"Vectorstore created with {collection.count()} documents")`,
            after: `
**Mổ xẻ:**

- **\`PersistentClient(path=...)\`**: Chroma client trực tiếp, không qua LangChain
- **\`delete_collection\` if exists**: tránh duplicate (như Day 2)
- **\`openai.embeddings.create(input=texts)\`**: batch — gửi list strings, OpenAI return list embeddings cùng order
- **\`collection.add(ids=, embeddings=, documents=, metadatas=)\`**: explicit 4-field add. So với LangChain \`from_documents\` chỉ pass docs.

**Batch limit của OpenAI:**

- Max 2048 input items per request
- Max ~8K tokens per input

Cho corpus lớn:

\`\`\`python
import math

BATCH_SIZE = 100
for i in range(0, len(texts), BATCH_SIZE):
    batch = texts[i:i + BATCH_SIZE]
    emb = openai.embeddings.create(model=embedding_model, input=batch).data
    # ... add to collection
\`\`\`

**Cost cho 123 chunks × ~700 chars = ~22K tokens:** \`text-embedding-3-large\` ~$0.003. Trivial.

**Pro implementation thường thêm:**
- Multiprocessing cho parallel embedding API calls
- Progress bar (\`tqdm\`)
- Retry với exponential backoff cho rate limit
- Cost tracking

Day 5 keep simple để focus advanced RAG techniques.
`
        },
        {
            title: "Bước 4 — Re-ranking với LLM-as-Judge",
            lang: "python",
            before: `
**Pattern 2-stage retrieval.**

- Stage 1: dense retrieval → top-10 (cast wide net, fast)
- Stage 2: LLM re-rank → top-3 (slow, accurate)

LLM nhận 10 chunks + question → trả về ranked order. Đây là **listwise reranking** — judge cả batch cùng lúc.
`,
            code: `class RankOrder(BaseModel):
    order: list[int] = Field(
        description="The order of relevance of chunks, from most relevant to least relevant, by chunk id number"
    )

def rerank(question, chunks):
    system_prompt = """
You are a document re-ranker.
You are provided with a question and a list of relevant chunks of text from a query of a knowledge base.
The chunks are provided in the order they were retrieved; this should be approximately ordered by relevance, but you may be able to improve on that.
You must rank order the provided chunks by relevance to the question, with the most relevant chunk first.
Reply only with the list of ranked chunk ids, nothing else. Include all the chunk ids you are provided with, reranked.
"""
    user_prompt = f"The user has asked the following question:\\n\\n{question}\\n\\n"
    user_prompt += "Order all the chunks of text by relevance to the question, from most relevant to least relevant.\\n\\n"
    user_prompt += "Here are the chunks:\\n\\n"
    for index, chunk in enumerate(chunks):
        user_prompt += f"# CHUNK ID: {index + 1}:\\n\\n{chunk.page_content}\\n\\n"
    user_prompt += "Reply only with the list of ranked chunk ids, nothing else."

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    response = completion(model=MODEL, messages=messages, response_format=RankOrder)
    reply = response.choices[0].message.content
    order = RankOrder.model_validate_json(reply).order
    return [chunks[i - 1] for i in order]

# Test
RETRIEVAL_K = 20
question = "Who went to Manchester University?"
chunks = fetch_context_unranked(question)
reranked = rerank(question, chunks)
print(f"After rerank, top chunk: {reranked[0].page_content[:100]}")`,
            after: `
**Quan sát thực tế:**

Edward demo với question "Who went to Manchester University?":

- **Trước rerank**: chunk có "Manchester" ở vị trí 17/20 (lost in noise)
- **Sau rerank**: chunk có "Manchester" ở vị trí 0 (top)

→ Re-ranking biến retrieval "decent" thành "excellent". 1 LLM call thêm, lift đáng kể.

**Tại sao listwise > pointwise rerank:**

- **Pointwise**: score mỗi (query, chunk) pair độc lập → sort. Đơn giản nhưng miss relative comparison.
- **Listwise**: LLM nhìn TẤT CẢ chunks cùng lúc → compare relative. "Chunk A more relevant than B" — judgment relative.

LLM listwise thường tốt hơn 5-15% so với pointwise.

**Cost analysis:**

- Initial retrieve: 1 embedding call (~$0.0001)
- Rerank: 1 LLM call với 20 chunks ~30K tokens = ~$0.003

Total ~$0.003 per query. So với accuracy lift, worth it.

**Production alternatives:**

- **Cohere Rerank API**: dedicated reranker, $0.001 per 1000 queries. Faster.
- **bge-reranker** (HuggingFace): cross-encoder open-source. Local, free.
- **Cohere multilingual**: support nhiều ngôn ngữ.

Cho prototype: LLM rerank đơn giản, không cần extra dependency. Production: dedicated reranker.
`
        },
        {
            title: "Bước 5 — Query rewriting cho conversational RAG",
            lang: "python",
            before: `
**Bridge conversational gap.**

User hỏi "How much does it cost?" trong context follow-up của "What is Carllm?" → câu hỏi đơn lẻ không có "it". Vector search "How much does it cost" → không match Carllm pricing chunks.

**Solution:** rewrite query thành standalone với LLM, **trước** khi search.
`,
            code: `def rewrite_query(question, history=[]):
    """Rewrite user's question to be specific, likely to surface relevant content."""
    message = f"""
You are in a conversation with a user, answering questions about the company Insurellm.
You are about to look up information in a Knowledge Base to answer the user's question.

This is the history of your conversation so far with the user:
{history}

And this is the user's current question:
{question}

Respond only with a single, refined question that you will use to search the Knowledge Base.
It should be a VERY short specific question most likely to surface content. Focus on the question details.
Don't mention the company name unless it's a general question about the company.
IMPORTANT: Respond ONLY with the knowledgebase query, nothing else.
"""
    response = completion(model=MODEL, messages=[{"role": "system", "content": message}])
    return response.choices[0].message.content

# Test cases
print(rewrite_query("Who won the IIOTY award?", []))
# Output: "IIOTY award winner"

print(rewrite_query("How much does it cost?", [
    {"role": "user", "content": "Tell me about Carllm"},
    {"role": "assistant", "content": "Carllm is our flagship car insurance product..."}
]))
# Output: "Carllm pricing"`,
            after: `
**Mổ xẻ:**

**Prompt design:**

- **Context**: history of conversation
- **Goal**: produce search query, NOT answer
- **Constraint**: "VERY short specific" — không verbose
- **Anti-pattern**: "Don't mention company name unless general" — tránh "Carllm Insurellm pricing Insurellm" duplicated

**Lift đo được:**

- Without rewrite: follow-up question fail ~50%
- With rewrite: success ~85%

Đây là 1 LLM call thêm (~$0.0001) → big improvement.

**Full pipeline ráp tất cả:**

\`\`\`python
def answer_question(question, history=[]):
    # 1. Rewrite query với history context
    query = rewrite_query(question, history)

    # 2. Fetch unranked top-K
    chunks = fetch_context_unranked(query)

    # 3. Rerank
    reranked = rerank(query, chunks)

    # 4. Build prompt với original question (not rewrite)
    messages = make_rag_messages(question, history, reranked)

    # 5. LLM answer
    response = completion(model=MODEL, messages=messages)
    return response.choices[0].message.content, reranked
\`\`\`

**Lưu ý nuance:** rewrite query **chỉ cho search**. Khi gọi LLM cuối, dùng **original question** — để LLM trả lời đúng câu user hỏi (không phải câu rewrite).

**Đây là full pipeline production-grade.** Re-eval với 150 test cases → expect MRR từ 0.73 → 0.91 và per-category improvement đáng kể.
`
        }
    ]
});
