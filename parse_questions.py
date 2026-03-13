"""
TOEIC Question Bank Parser
Parses HTML files from data/ directory into a structured JSON file.
"""

import json
import os
import re
from bs4 import BeautifulSoup, NavigableString

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "public", "questions.json")
UNITS = [3, 4, 5, 6, 9, 11, 16, 17, 18, 24]
PARTS = [1, 2, 3, 4, 5, 6, 7]

PART_INFO = {
    1: {"name": "照片描述", "nameEn": "Photographs", "type": "photo", "optionCount": 4},
    2: {"name": "應答問題", "nameEn": "Question-Response", "type": "response", "optionCount": 3},
    3: {"name": "簡短對話", "nameEn": "Short Conversations", "type": "conversation", "optionCount": 4},
    4: {"name": "簡短獨白", "nameEn": "Short Talks", "type": "talk", "optionCount": 4},
    5: {"name": "單句填空", "nameEn": "Incomplete Sentences", "type": "sentence", "optionCount": 4},
    6: {"name": "短文填空", "nameEn": "Text Completion", "type": "text_completion", "optionCount": 4},
    7: {"name": "閱讀理解", "nameEn": "Reading Comprehension", "type": "reading", "optionCount": 4},
}


def get_html_path(part, unit):
    base = os.path.join(DATA_DIR, str(part), str(unit), "__ TOEIC--模擬測驗 ___files")
    filename = f"correct{part}2.html"
    return os.path.join(base, filename)


def clean_text(text):
    """Clean extracted text: strip whitespace and normalize."""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_option_text(td):
    """Extract option text from a <td> element, removing radio button and answer marker."""
    text = td.get_text(strip=False)
    # Remove (正解) marker
    text = re.sub(r'\(正解\)', '', text)
    text = clean_text(text)
    return text


def parse_question_from_fieldset(fieldset):
    """Parse a single question from a <fieldset> element."""
    question = {}

    # Get question number
    q_label = fieldset.find("span", class_="label")
    if q_label:
        num_match = re.search(r'Question\s*(\d+)', q_label.get_text())
        if num_match:
            question["number"] = int(num_match.group(1))

    # Get question stem (in dark gray background)
    stem_td = fieldset.find("td", attrs={"bgcolor": "#666666"})
    if stem_td:
        question["stem"] = clean_text(stem_td.get_text())

    # Get options and correct answer
    options = []
    answer = None
    inner_table = fieldset.find("table", class_="table")
    if not inner_table:
        # fallback: find any nested table with radio buttons
        inner_table = fieldset

    for tr in inner_table.find_all("tr"):
        td = tr.find("td")
        if not td:
            continue
        bg = td.get("bgcolor", "")
        radio = td.find("input", attrs={"type": "radio"})

        if radio:
            opt_text = extract_option_text(td)
            options.append(opt_text)
            if bg == "#F9C795":
                answer = radio.get("value", "")

        elif bg == "#E4FFCA":
            raw = td.decode_contents()
            # Split by <br> tags to get individual translations
            parts = re.split(r'<br\s*/?>', raw)
            translations = [clean_text(BeautifulSoup(p, "html.parser").get_text()) for p in parts]
            translations = [t for t in translations if t]
            question["translation"] = translations

    question["options"] = options
    question["answer"] = answer
    return question


def parse_passage_block(element):
    """Extract passage text (conversation, talk, article) and its translation from a block."""
    passage_en = ""
    passage_zh = ""
    vocabulary = []

    # Find the passage content cell (usually in bgcolor="#E4FFCA" for Part 3/4)
    passage_td = element.find("td", attrs={"bgcolor": "#E4FFCA"})
    if passage_td:
        raw_html = passage_td.decode_contents()
        parts = re.split(r'<br\s*/?>', raw_html)
        lines = [clean_text(BeautifulSoup(p, "html.parser").get_text()) for p in parts]
        lines = [l for l in lines if l]

        # Separate English, Chinese, and vocabulary using CJK ratio
        en_lines = []
        zh_lines = []
        vocab_lines = []
        section = "en"  # start with english

        for line in lines:
            cjk_count = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', line))
            cjk_ratio = cjk_count / max(len(line), 1)

            if line.startswith("重要單字") or line.startswith("重要片語"):
                section = "vocab"
                continue
            elif section == "vocab":
                vocab_lines.append(line)
            elif section == "zh":
                # Once in Chinese section, stay there (unless vocab)
                zh_lines.append(line)
            elif cjk_ratio > 0.2:
                # Transition to Chinese section
                section = "zh"
                zh_lines.append(line)
            else:
                en_lines.append(line)

        passage_en = "\n".join(en_lines)
        passage_zh = "\n".join(zh_lines)
        vocabulary = vocab_lines

    # For Part 6/7, the passage is in a <font> tag inside a regular <td>
    if not passage_en:
        font_tag = element.find("font")
        if font_tag:
            raw_html = font_tag.decode_contents()
            # Split into English and Chinese parts
            # Look for the Chinese translation section
            parts = re.split(r'<br\s*/?>', raw_html)
            lines = [clean_text(BeautifulSoup(p, "html.parser").get_text()) for p in parts]
            lines = [l for l in lines if l]

            en_lines = []
            zh_lines = []
            vocab_lines = []
            found_zh = False
            found_vocab = False

            for line in lines:
                # Skip group header line
                if re.match(r'^Questions?\s+\d+', line):
                    continue
                if line.startswith("重要單字") or line.startswith("重要片語"):
                    found_vocab = True
                    continue
                if found_vocab:
                    vocab_lines.append(line)
                elif found_zh:
                    zh_lines.append(line)
                else:
                    cjk_count = len(re.findall(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', line))
                    cjk_ratio = cjk_count / max(len(line), 1)
                    if cjk_ratio > 0.2:
                        found_zh = True
                        zh_lines.append(line)
                    else:
                        en_lines.append(line)

            passage_en = "\n".join(en_lines)
            passage_zh = "\n".join(zh_lines)
            vocabulary = vocab_lines

    return passage_en, passage_zh, vocabulary


def find_group_header(element):
    """Check if element contains a 'Questions X through Y' header, return range."""
    text = element.get_text()
    # Pattern: "Questions 1 through 3" or "Questions 1 - 4"
    match = re.search(r'Questions?\s+(\d+)\s+(?:through|to|-)\s+(\d+)', text)
    if match:
        return int(match.group(1)), int(match.group(2))
    return None


def parse_single_questions(soup, part, unit):
    """Parse parts with single questions (Part 1, 2, 5)."""
    cards = []
    fieldsets = soup.find_all("fieldset")

    for fs in fieldsets:
        q = parse_question_from_fieldset(fs)
        if not q.get("options"):
            continue

        card_id = f"p{part}-u{unit}-q{q.get('number', 0)}"

        card = {
            "id": card_id,
            "part": part,
            "unit": unit,
            "type": PART_INFO[part]["type"],
            "questions": [q],
        }

        # For Part 1, extract image path
        if part == 1:
            img = fs.find("img")
            if img and img.get("src"):
                img_src = img["src"].replace("./", "")
                card["image"] = f"data/1/{unit}/__ TOEIC--模擬測驗 ___files/{img_src}"

        cards.append(card)

    return cards


def parse_grouped_questions(soup, part, unit):
    """Parse parts with grouped questions (Part 3, 4, 6, 7)."""
    cards = []
    container = soup.find("div", class_="container")
    if not container:
        return cards

    # Find all passage blocks and fieldsets in order
    # Passage blocks are <table> elements before fieldsets that contain the group header
    all_elements = container.find_all(["table", "fieldset", "hr"], recursive=True)

    current_passage_en = ""
    current_passage_zh = ""
    current_vocab = []
    current_group_start = None
    current_group_end = None
    current_questions = []
    group_index = 0

    # Iterate through top-level structure
    # Strategy: find <hr> or passage tables that precede fieldsets
    top_level = []
    for child in container.find("div", style=re.compile("padding-top")).children if container.find("div", style=re.compile("padding-top")) else container.children:
        if isinstance(child, NavigableString):
            continue
        top_level.append(child)

    i = 0
    while i < len(top_level):
        el = top_level[i]

        # Check for group header in <table> elements
        if el.name == "table":
            header = find_group_header(el)
            if header:
                # Save previous group if exists
                if current_questions:
                    group_index += 1
                    card_id = f"p{part}-u{unit}-g{group_index}"
                    cards.append({
                        "id": card_id,
                        "part": part,
                        "unit": unit,
                        "type": PART_INFO[part]["type"],
                        "passage": current_passage_en,
                        "passageTranslation": current_passage_zh,
                        "vocabulary": current_vocab,
                        "questions": current_questions,
                    })
                    current_questions = []

                current_group_start, current_group_end = header
                # Extract passage from this table
                passage_en, passage_zh, vocab = parse_passage_block(el)
                current_passage_en = passage_en
                current_passage_zh = passage_zh
                current_vocab = vocab

        elif el.name == "fieldset":
            q = parse_question_from_fieldset(el)
            if q.get("options"):
                current_questions.append(q)

        i += 1

    # Save last group
    if current_questions:
        group_index += 1
        card_id = f"p{part}-u{unit}-g{group_index}"
        cards.append({
            "id": card_id,
            "part": part,
            "unit": unit,
            "type": PART_INFO[part]["type"],
            "passage": current_passage_en,
            "passageTranslation": current_passage_zh,
            "vocabulary": current_vocab,
            "questions": current_questions,
        })

    return cards


def parse_html_file(part, unit):
    """Parse a single HTML file and return cards."""
    path = get_html_path(part, unit)
    if not os.path.exists(path):
        print(f"  WARNING: File not found: {path}")
        return []

    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")

    if part in [1, 2, 5]:
        return parse_single_questions(soup, part, unit)
    else:
        return parse_grouped_questions(soup, part, unit)


def main():
    all_cards = []
    part_stats = {}

    for part in PARTS:
        part_cards = []
        part_questions = 0
        print(f"Parsing Part {part} ({PART_INFO[part]['name']})...")

        for unit in UNITS:
            print(f"  Unit {unit}...", end=" ")
            cards = parse_html_file(part, unit)
            q_count = sum(len(c["questions"]) for c in cards)
            print(f"{len(cards)} cards, {q_count} questions")
            part_cards.extend(cards)
            part_questions += q_count

        part_stats[str(part)] = {
            "name": PART_INFO[part]["name"],
            "nameEn": PART_INFO[part]["nameEn"],
            "type": PART_INFO[part]["type"],
            "totalCards": len(part_cards),
            "totalQuestions": part_questions,
        }
        all_cards.extend(part_cards)

    total_questions = sum(s["totalQuestions"] for s in part_stats.values())
    total_cards = len(all_cards)

    output = {
        "metadata": {
            "totalQuestions": total_questions,
            "totalCards": total_cards,
            "parts": part_stats,
        },
        "cards": all_cards,
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"Total: {total_cards} cards, {total_questions} questions")
    print(f"Output: {OUTPUT_FILE}")
    for p, s in part_stats.items():
        print(f"  Part {p} ({s['name']}): {s['totalCards']} cards, {s['totalQuestions']} questions")


if __name__ == "__main__":
    main()
