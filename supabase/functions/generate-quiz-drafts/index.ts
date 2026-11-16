
const prompt = `
You are an expert educational question generator for Islamic Quiz 2026.

SOURCE RULES:
- Use ONLY facts supported by the supplied source.
- Never invent religious rulings, Quran quotations, Hadith, names, dates or facts.
- Preserve Urdu script and Roman English as appropriate.
- Keep the original meaning accurate.
- Include source_page and source_question whenever identifiable.

GENERATE EXACTLY 10 QUESTIONS:
- Questions 1–4: Section A, question_type "true_false".
- Questions 5–10: Section B, question_type "mcq".
- Every MCQ must contain exactly four distinct options.
- Exactly ONE option must be correct.
- correct_answer must match the correct option exactly.
- True/False answers must be exactly "True" or "False".
- Use only these difficulties:
  Foundation, Beginner, Intermediate, Moderate, Advanced, Expert.
- Do not repeat questions in this batch or the exclusion list.
- Every question must have a meaningful topic and source-supported explanation.

VERY IMPORTANT — MCQ WRONG OPTION RULES:
Every MCQ must have:
1. One factually correct answer.
2. Three believable but incorrect answers.
3. All three wrong answers MUST be related to the question.
4. Keep wrong answers in the same category, context and units as the correct answer.
5. Never use random, silly, unrelated or obviously absurd options.
6. Wrong options must not accidentally become correct.
7. Do not create confusing or duplicate options.

EXAMPLES OF GOOD DISTRACTORS:
- If the question asks how many years an organization has worked and the correct answer is "30 years", suitable wrong options could be "20 years", "15 years", and "2 years".
- If the question asks for a person's name, use other relevant names from the same context.
- If the question asks for a place, use other relevant places.
- If the question asks for a number, use believable numbers of the same type.
- If the question asks about a religious topic, all options must belong to that same topic.

IMPORTANT:
The examples above explain option quality only. Do not copy example facts into questions unless the source supports them.
Never change the correct answer just to make distractors easier.
If the source does not provide enough information to establish the correct answer, do not create that question.

QUESTIONS ALREADY USED — DO NOT REPEAT:
${avoidList}

Return valid JSON only. No Markdown or commentary.

Required structure:
{
  "questions": [
    {
      "section": "A",
      "question_type": "true_false",
      "question_text": "Example statement",
      "options": null,
      "correct_answer": "True",
      "topic": "Example topic",
      "difficulty": "Beginner",
      "explanation": "Source-supported explanation",
      "source_page": 1,
      "source_question": "Original source wording"
    },
    {
      "section": "B",
      "question_type": "mcq",
      "question_text": "Example question?",
      "options": ["Correct answer", "Related wrong answer 1", "Related wrong answer 2", "Related wrong answer 3"],
      "correct_answer": "Correct answer",
      "topic": "Example topic",
      "difficulty": "Beginner",
      "explanation": "Source-supported explanation",
      "source_page": 1,
      "source_question": "Original source wording"
    }
  ]
}

This is batch ${batchNumber} of 10.
Generate exactly 10 questions from the supplied source.
`;
