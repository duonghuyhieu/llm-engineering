// Manifest: danh sách toàn bộ tuần/ngày của khóa học.
// Mỗi day sẽ tương ứng với một file dữ liệu trong thư mục data/.
window.MANIFEST = {
    weeks: [
        {
            week: 1,
            title: "Frontier APIs · Web Summarizer",
            days: [
                { day: 1, title: "Khởi đầu: Ollama, setup, OpenAI API, Web Summarizer" },
                { day: 2, title: "Frontier vs Open-Source · OpenAI Python Client" },
                { day: 3, title: "Base/Chat/Reasoning Models · So sánh Frontier" },
                { day: 4, title: "Transformers · Tokens · Tokenizers · Context Window" },
                { day: 5, title: "Brochure Generator · Multi-step calls · Streaming" }
            ]
        },
        {
            week: 2,
            title: "Multi-Modal Chatbot · Gradio · Tools",
            days: [
                { day: 1, title: "Kết nối nhiều Frontier · OpenRouter · LangChain vs LiteLLM" },
                { day: 2, title: "Gradio cơ bản · UI có auth · Streaming Markdown" },
                { day: 3, title: "Chat UI · Multi-shot · Sneak peek RAG" },
                { day: 4, title: "Tool calling · Airline Assistant · SQLite tools" },
                { day: 5, title: "Agentic AI · Multi-modal · DALL·E · TTS" }
            ]
        },
        {
            week: 3,
            title: "HuggingFace · Pipelines · Transformers",
            days: [
                { day: 1, title: "HF Hub · Colab · Stable Diffusion / FLUX" },
                { day: 2, title: "Pipelines: NER, Q&A, Image, Audio, Diffusion" },
                { day: 3, title: "Tokenizers · Chat Templates · So sánh tokenizer" },
                { day: 4, title: "Transformers low-level · Quantization · LLaMA decoder" },
                { day: 5, title: "Token-by-token inference · Meeting Minutes (Whisper)" }
            ]
        },
        {
            week: 4,
            title: "Model Selection · Benchmarks · Code Gen",
            days: [
                { day: 1, title: "Chinchilla Law · GPQA/MMLU · Connect-4 leaderboard" },
                { day: 2, title: "LM Arena · LiveBench · Use cases thương mại" },
                { day: 3, title: "Python → C++ · GPT-5 · 230× speedup" },
                { day: 4, title: "Open-source coder: Qwen, DeepSeek · Gradio UI" },
                { day: 5, title: "Python → Rust · Đánh giá kỹ thuật vs business" }
            ]
        },
        {
            week: 5,
            title: "Mastering RAG",
            days: [
                { day: 1, title: "RAG cơ bản · Vector embeddings · Encoder LLM" },
                { day: 2, title: "LangChain splitters · Chroma · t-SNE viz" },
                { day: 3, title: "RAG pipeline · LangChain · Gradio production" },
                { day: 4, title: "RAG Eval: MRR, nDCG · LLM-as-judge" },
                { day: 5, title: "Advanced RAG: re-ranking, query expansion, GraphRAG" }
            ]
        },
        {
            week: 6,
            title: "Traditional ML → DL → Frontier Fine-tune",
            days: [
                { day: 1, title: "Curate dataset · Amazon · Weighted sampling" },
                { day: 2, title: "5-step strategy · Groq batch processing" },
                { day: 3, title: "Random/Linear/BoW · RandomForest · XGBoost" },
                { day: 4, title: "Neural network · Frontier baseline (GPT/Claude)" },
                { day: 5, title: "Fine-tune GPT-4o-mini · DNN 289M params" }
            ]
        },
        {
            week: 7,
            title: "Fine-tune open-source · QLoRA",
            days: [
                { day: 1, title: "QLoRA · LoRA hyperparams · 4-bit quantization" },
                { day: 2, title: "Chuẩn bị dataset · Token limits · Base vs Chat" },
                { day: 3, title: "Hyperparams · TRL SFTTrainer · Weights & Biases" },
                { day: 4, title: "A100 800K · Theo dõi loss · Tránh overfitting" },
                { day: 5, title: "Inference · Cross-entropy · LLaMA 3.2 vs GPT-5" }
            ]
        },
        {
            week: 8,
            title: "Agentic AI · Modal · Multi-agent",
            days: [
                { day: 1, title: "Modal serverless · Deploy fine-tuned model" },
                { day: 2, title: "Advanced RAG · Ensemble (RAG + NN + Modal)" },
                { day: 3, title: "Structured outputs · Pydantic · Pushover agent" },
                { day: 4, title: "Planner agent · Tool orchestration · Multi-agent" },
                { day: 5, title: "Price-Is-Right UI · Wrap-up khóa học" }
            ]
        }
    ]
};
