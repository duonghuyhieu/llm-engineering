window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 1,
    day: 5,
    title: "Brochure Generator · JSON mode · Multi-step calls · Streaming",
    notebooks: ["week1/day5.ipynb"],
    topics: [
        "Project tổng kết Tuần 1 — Brochure Generator",
        "Bài toán phải gọi LLM nhiều lần (multi-step) → mầm Agentic AI",
        "JSON mode (response_format) — bắt model trả output có cấu trúc",
        "One-shot prompting: ví dụ output mẫu trong system prompt",
        "Streaming với stream=True — UX kiểu typewriter của ChatGPT",
        "Tone control — đổi tone chỉ bằng cách sửa system prompt"
    ],
    summary: `
## 1. Sản phẩm cuối Tuần 1

Day 5 ráp tất cả Tuần 1 thành **một sản phẩm hoàn chỉnh**: Brochure Generator. Input là tên + URL công ty, output là brochure marketing dạng Markdown.

**Pipeline:**

\`\`\`
URL công ty
   ↓ (LLM call #1: chọn link liên quan, trả JSON)
{about, careers, blog, ...}
   ↓ (scrape & ghép nội dung từng trang)
Mega-prompt với context của toàn bộ trang
   ↓ (LLM call #2: viết brochure markdown, streaming)
Brochure đẹp hiển thị trong Jupyter
\`\`\`

## 2. Vì sao Day 5 là 'Agentic AI mầm mống'

Vì nó kết nối *nhiều* LLM call có quan hệ dependency: output của call #1 (link list) là input của call #2 (brochure). Đây là pattern cơ bản của agentic system — Tuần 2 sẽ mở rộng thành tool calling thực sự, Tuần 8 thành multi-agent.

## 3. Hai trick quan trọng

- **JSON mode**: ép model trả output là valid JSON parse được. Khác structured output strict (Tuần 8) — chỉ đảm bảo valid JSON, không đảm bảo schema.
- **Streaming**: thêm \`stream=True\` để text chảy ra dần như ChatGPT. UX cải thiện đáng kể cho long output.
`,
    callouts: [
        {
            type: "info",
            text: "**Use case business:** Brochure chỉ là một ví dụ. Cùng pattern (multi-step + JSON + streaming) áp dụng được cho proposal/SOW từ requirements, product changelog từ git log, personalized email từ CRM, tutorial từ API spec, job description từ team page…"
        },
        {
            type: "warn",
            text: "**Scrape có giới hạn:** website JavaScript-heavy (React SPA) không lấy được content. CloudFront có thể trả 403. Scraper trong khóa là phiên bản đơn giản với requests+BeautifulSoup — chỉ hoạt động với HTML tĩnh."
        }
    ],
    keyPoints: [
        "**JSON mode chỉ đảm bảo output là valid JSON, KHÔNG đảm bảo schema.** Phải đặt ví dụ schema trong prompt để model biết format. Tuần 8 sẽ học Structured Outputs với Pydantic strict.",
        "**One-shot prompting** = 1 ví dụ. **Few-shot** = vài ví dụ. Càng nhiều ví dụ → bám format càng tốt, nhưng tốn token.",
        "**Truncate context khi cần:** \`user_prompt[:5000]\` ngăn brochure vượt context. Sau này dùng tiktoken cắt theo *token* chính xác hơn cắt theo *character*.",
        "**Streaming pattern:** \`for chunk in stream: chunk.choices[0].delta.content\`. Lưu ý \`delta.content\` có thể là \`None\` (cuối stream) → cần \`or ''\`.",
        "**Streaming không tiết kiệm token.** Chỉ thay đổi *latency cảm nhận*. Tổng cost = same.",
        "**Đổi tone chỉ bằng 1 dòng system prompt.** Đây là điểm bán hàng lớn nhất của prompt engineering."
    ],
    code: [
        {
            title: "Bước 1 — Setup và xem links có trên website",
            lang: "python",
            before: `
**Khởi đầu.** Setup imports thông thường + load API key. Helper \`fetch_website_links\` trong \`scraper.py\` extract tất cả \`<a href>\` từ trang.
`,
            code: `import os
import json
from dotenv import load_dotenv
from IPython.display import Markdown, display, update_display
from scraper import fetch_website_links, fetch_website_contents
from openai import OpenAI

load_dotenv(override=True)
MODEL = 'gpt-5-nano'
openai = OpenAI()

# Xem website edwarddonner.com có những link gì
links = fetch_website_links("https://edwarddonner.com")
links`,
            after: `
**Output mẫu:**

\`\`\`python
[
    'https://edwarddonner.com',
    'https://edwarddonner.com/about',
    'https://edwarddonner.com/courses',
    'https://edwarddonner.com/posts',
    'https://www.linkedin.com/in/eddonner',
    'https://twitter.com/edwarddonner',
    'https://edwarddonner.com/privacy-policy',
    ...
    # ~30-50 links typical
]
\`\`\`

Quan sát: list này có **đủ thứ** — link nội bộ (about, courses), link external (LinkedIn, Twitter), link không liên quan (privacy policy, terms). Không phải tất cả đều cần cho brochure. Đây là chỗ LLM tỏa sáng — filter intelligently.
`
        },
        {
            title: "Bước 2 — One-shot prompt để LLM chọn link relevant",
            lang: "python",
            before: `
**Trick quan trọng:** đưa **ví dụ JSON output** trong system prompt → model bắt chước format chính xác. Đây là **one-shot prompting** — chỉ 1 ví dụ, đủ để model bám pattern.

Đồng thời định nghĩa rõ tiêu chí "relevant" trong tự nhiên ngôn ngữ.
`,
            code: `link_system_prompt = """
You are provided with a list of links found on a webpage.
You are able to decide which of the links would be most relevant to include in a brochure about the company,
such as links to an About page, or a Company page, or Careers/Jobs pages.
You should respond in JSON as in this example:

{
    "links": [
        {"type": "about page", "url": "https://full.url/goes/here/about"},
        {"type": "careers page", "url": "https://another.full.url/careers"}
    ]
}
"""

def get_links_user_prompt(url):
    user_prompt = f"""
Here is the list of links on the website {url} -
Please decide which of these are relevant web links for a brochure about the company,
respond with the full https URL in JSON format.
Do not include Terms of Service, Privacy, email links.

Links (some might be relative links):

"""
    links = fetch_website_links(url)
    user_prompt += "\\n".join(links)
    return user_prompt`,
            after: `
**Mổ xẻ system prompt:**

- **Vai trò:** "You are provided with a list of links..." — định nghĩa input
- **Task:** "decide which... most relevant... brochure" — định nghĩa output goal
- **Format constraint:** "respond in JSON as in this example:" + JSON template — đây chính là *one-shot example*
- **Field structure:** \`{"type": "...", "url": "..."}\` — schema rõ ràng

**Mổ xẻ user prompt:**

- Bắt đầu với context: "Here is the list of links on {url}"
- Negative instruction: "Do not include Terms of Service, Privacy, email links" — quan trọng vì model dễ "tham" include tất cả
- Append actual data: \`"\\n".join(links)\`

**Tại sao tách system + user?**
- System = "luật chơi" (không đổi)
- User = "dữ liệu cụ thể" (đổi mỗi call)
- Đặt sai có thể confuse model và phá prompt caching sau này
`
        },
        {
            title: "Bước 3 — Bật JSON mode để model trả JSON parse được",
            lang: "python",
            before: `
**JSON mode** là feature của OpenAI API — set \`response_format={"type": "json_object"}\` để **bắt buộc** model trả output là valid JSON. Không có flag này, model có thể trả markdown với JSON bọc trong \`\`\`json ... \`\`\`, gây fail \`json.loads()\`.
`,
            code: `def select_relevant_links(url):
    print(f"Selecting relevant links for {url} by calling {MODEL}")
    response = openai.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": link_system_prompt},
            {"role": "user", "content": get_links_user_prompt(url)}
        ],
        response_format={"type": "json_object"}   # ← JSON mode
    )
    result = response.choices[0].message.content
    links = json.loads(result)                    # parse safe vì đã JSON
    print(f"Found {len(links['links'])} relevant links")
    return links

# Test
select_relevant_links("https://edwarddonner.com")`,
            after: `
**Output mẫu:**

\`\`\`python
{
    'links': [
        {'type': 'about page', 'url': 'https://edwarddonner.com/about'},
        {'type': 'posts page', 'url': 'https://edwarddonner.com/posts'},
        {'type': 'courses page', 'url': 'https://edwarddonner.com/courses'},
        {'type': 'linkedin', 'url': 'https://www.linkedin.com/in/eddonner'}
    ]
}
\`\`\`

**Quan sát:**
- Đã filter ra hết \`privacy-policy\`, \`terms\`, social không cần thiết
- "type" field model tự đặt theo categorization của nó — không cố định
- 4-5 links là sweet spot cho brochure (đủ context, không quá nhồi)

**Cảnh báo:** JSON mode chỉ đảm bảo **valid JSON**, không đảm bảo **schema**. Model có thể trả:
- \`{"deals": [...]}\` thay vì \`{"links": [...]}\` (sai key)
- \`{"links": "https://..."}\` thay vì list (sai type)
- Thêm fields ngẫu nhiên

Trong production: validate sau parse với Pydantic. Tuần 8 sẽ học **Structured Outputs strict** — ép schema chính xác đến từng field.
`
        },
        {
            title: "Bước 4 — Gộp content của landing page + relevant pages",
            lang: "python",
            before: `
**Ghép context.** Với từng link đã chọn ở bước 3, scrape lại content. Gộp tất cả thành một mega-prompt cho LLM call #2.

Đây là kiểu RAG đơn giản — retrieval (chọn link) + augmentation (nhồi vào context). Tuần 5 sẽ làm RAG đúng nghĩa với vector embedding.
`,
            code: `def fetch_page_and_all_relevant_links(url):
    contents = fetch_website_contents(url)
    relevant_links = select_relevant_links(url)
    result = f"## Landing Page:\\n\\n{contents}\\n## Relevant Links:\\n"
    for link in relevant_links['links']:
        result += f"\\n\\n### Link: {link['type']}\\n"
        result += fetch_website_contents(link["url"])
    return result

# Test - sẽ in một text rất dài
print(fetch_page_and_all_relevant_links("https://huggingface.co"))`,
            after: `
**Cấu trúc output:**

\`\`\`
## Landing Page:

[nội dung text của trang chủ huggingface.co]

## Relevant Links:

### Link: about page
[nội dung trang about]

### Link: company page
[nội dung trang company]

### Link: careers page
[nội dung trang careers]
\`\`\`

**Markdown headers (\`##\`, \`###\`)** dùng để LLM phân biệt section. Trick này hữu ích — LLM được train trên rất nhiều markdown, hiểu tự nhiên cấu trúc heading.

**Vấn đề tiềm năng:** kết quả có thể rất dài (10K+ tokens nếu site nhiều content). Bước tiếp theo sẽ truncate.
`
        },
        {
            title: "Bước 5 — Sinh brochure (non-streaming version)",
            lang: "python",
            before: `
**LLM call #2** — main event. Nhồi context + system prompt đã định nghĩa tone → output brochure Markdown.

**Truncate \`[:5000]\`** để đề phòng context overflow. Crude nhưng đủ cho demo.
`,
            code: `brochure_system_prompt = """
You are an assistant that analyzes the contents of several relevant pages from a company website
and creates a short brochure about the company for prospective customers, investors and recruits.
Respond in markdown without code blocks.
Include details of company culture, customers and careers/jobs if you have the information.
"""

def get_brochure_user_prompt(company_name, url):
    user_prompt = f"""
You are looking at a company called: {company_name}
Here are the contents of its landing page and other relevant pages;
use this information to build a short brochure of the company in markdown without code blocks.\\n\\n
"""
    user_prompt += fetch_page_and_all_relevant_links(url)
    user_prompt = user_prompt[:5_000]   # Truncate
    return user_prompt

def create_brochure(company_name, url):
    response = openai.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": brochure_system_prompt},
            {"role": "user", "content": get_brochure_user_prompt(company_name, url)}
        ],
    )
    result = response.choices[0].message.content
    display(Markdown(result))

create_brochure("HuggingFace", "https://huggingface.co")`,
            after: `
**Output:** Markdown brochure ~500-1000 từ, có heading "About HuggingFace", "Our Platform", "Culture", "Join Us", v.v.

**Diễn giải design decisions:**

- **System prompt nói rõ format:** "Respond in markdown without code blocks" — quan trọng. Nếu không, model có thể bọc output trong \`\`\`markdown ... \`\`\` (LLM hay làm thế khi prompt nói "in markdown"), gây hỏng render.

- **Liệt kê 3 audience trong system:** "prospective customers, investors and recruits" → model balance tone phù hợp. Nếu chỉ nói "customers" → brochure thiên sales pitch.

- **Section gợi ý** ("culture, customers, careers") — không bắt buộc model phải có nhưng nhắc nó nếu có info.

**Pitfall thường gặp:** brochure có **placeholder** kiểu "[Insert customer logos]". Đó là vì LLM không có data thật → bịa structure. Trong production: post-process strip placeholder, hoặc instruct rõ "do not include placeholders".
`
        },
        {
            title: "Bước 6 — Upgrade: streaming với hiệu ứng typewriter",
            lang: "python",
            before: `
**Streaming** là feature đáng học. UX tốt hơn cho long output (5+ giây) — user thấy text chảy ra dần thay vì màn hình trống → reply đột ngột.

**Cơ chế kỹ thuật:** \`stream=True\` → API trả về **iterator** thay vì final response. Mỗi iteration là một "chunk" chứa delta (token mới).
`,
            code: `def stream_brochure(company_name, url):
    stream = openai.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": brochure_system_prompt},
            {"role": "user", "content": get_brochure_user_prompt(company_name, url)}
        ],
        stream=True   # ← key change
    )
    response = ""
    display_handle = display(Markdown(""), display_id=True)
    for chunk in stream:
        response += chunk.choices[0].delta.content or ''
        update_display(Markdown(response), display_id=display_handle.display_id)

stream_brochure("HuggingFace", "https://huggingface.co")`,
            after: `
**Mổ xẻ pattern streaming:**

- \`stream=True\`: enable streaming
- \`for chunk in stream\`: iterator, mỗi chunk chứa **delta** (phần text mới sinh từ token cuối)
- \`chunk.choices[0].delta.content\`: text mới. **Có thể là \`None\`** (vd ở chunk đầu chứa metadata, hay chunk cuối báo finish reason) → cần \`or ''\` để skip safely
- \`response += ...\`: accumulate text từ đầu
- \`update_display(Markdown(response), display_id=...)\`: re-render Markdown cell với content mới mỗi chunk

**Trick của Jupyter:** \`display(...)\` lần đầu lấy \`display_id\`. Sau đó \`update_display(..., display_id=...)\` ghi đè cùng cell → tạo hiệu ứng "typewriter".

**Cost & latency:**
- Token total = same với non-streaming → **cost không đổi**
- Time to **last** token = same → **tổng thời gian không đổi**
- Time to **first** token = thấp hơn → **UX cảm nhận nhanh hơn nhiều**

Streaming đặc biệt giá trị cho UX, không phải cho cost optimization.
`
        },
        {
            title: "Bước 7 — Đổi tone chỉ bằng 1 dòng system prompt",
            lang: "python",
            before: `
**Power of prompt engineering.** Cùng pipeline, cùng code, đổi 1 dòng system prompt → output hoàn toàn khác về style.
`,
            code: `# Brochure công sở (default)
brochure_system_prompt = """
You are an assistant that analyzes the contents of several relevant pages from a company website
and creates a short brochure about the company for prospective customers, investors and recruits.
Respond in markdown without code blocks.
"""

# Brochure hài hước
brochure_system_prompt = """
You are an assistant that analyzes the contents of several relevant pages from a company website
and creates a short, humorous, entertaining, witty brochure about the company for prospective
customers, investors and recruits.
Respond in markdown without code blocks.
"""

# Chạy lại - cùng pipeline
stream_brochure("HuggingFace", "https://huggingface.co")`,
            after: `
**Quan sát:** brochure giờ có jokes về model open-source, references "the future of AI" trong tone tự trào, sub-heading kiểu "Why We're Cooler Than Your Average AI Lab", v.v.

**Đây là điểm bán hàng lớn nhất của prompt engineering:**
- 0 dòng code thay đổi
- 0 retrain model
- 1 dòng prompt → product variant mới

**Trong production, pattern phổ biến:**
- Lưu nhiều system prompt versions
- A/B test với user → đo engagement (read time, click-through)
- Pick winner → roll out

**Generalize:** mọi GenAI app đều có dạng "function(prompt, input) → output". Prompt là *config*, không phải *code*. Tách rời prompt khỏi code logic → iterate nhanh hơn 10×.
`
        }
    ]
});
