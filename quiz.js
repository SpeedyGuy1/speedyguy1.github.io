const dropZone = document.getElementById('dropZone');
const quizContainer = document.getElementById('quizContainer');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#333';
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = '#aaa';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#aaa';
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/json') {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const questions = Array.isArray(parsed) ? parsed : parsed.Quiz;
        if (Array.isArray(questions)) renderQuiz(questions);
        else alert('Invalid quiz format. Expected an array of questions.');
      } catch (err) {
        alert('Error reading JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  } else {
    alert('Please drop a valid JSON file.');
  }
});

function loadFromPaste() {
  const input = document.getElementById('pasteInput').value;
  try {
    const parsed = JSON.parse(input);
    const questions = Array.isArray(parsed) ? parsed : parsed.Quiz;
    if (Array.isArray(questions)) renderQuiz(questions);
    else alert('Invalid quiz format. Expected an array of questions.');
  } catch (err) {
    alert('Error parsing pasted JSON: ' + err.message);
  }
}

function renderQuiz(questions) {
  quizContainer.innerHTML = '';
  questions.forEach((q, index) => {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question';
    questionDiv.innerHTML = `<strong>Q${index + 1}: ${q.question}</strong>`;
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options';

    if (q.type === 'text') {
      optionsDiv.innerHTML = `<input type="text" id="q${index}_text" placeholder="Type your answer...">`;
    } else if (q.type === 'multiSelect' && q.options) {
      q.options.forEach((opt, i) => {
        const id = `q${index}_opt${i}`;
        optionsDiv.innerHTML += `
          <label>
            <input type="checkbox" name="q${index}" value="${i}" id="${id}" />
            ${opt}
          </label><br>`;
      });
    } else if (q.options) {
      q.options.forEach((opt, i) => {
        const id = `q${index}_opt${i}`;
        optionsDiv.innerHTML += `
          <label>
            <input type="radio" name="q${index}" value="${i}" id="${id}" />
            ${opt}
          </label><br>`;
      });
    }

    questionDiv.appendChild(optionsDiv);
    quizContainer.appendChild(questionDiv);
  });

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Submit Answers';
  submitBtn.className = 'submit-btn';
  submitBtn.onclick = () => showResults(questions);
  quizContainer.appendChild(submitBtn);
}

function showResults(questions) {
  let score = 0;
  document.querySelectorAll('.result').forEach(div => div.remove());

  questions.forEach((q, index) => {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result';
    const normalizedAnswers = normalizeAnswerArray(q.answer);

    if (q.type === 'text') {
      const input = document.getElementById(`q${index}_text`);
      const userAnswer = input ? input.value.trim().toLowerCase() : '';
      const correctAnswers = normalizedAnswers.map(a => a.toLowerCase());
      if (correctAnswers.includes(userAnswer)) {
        score++;
        resultDiv.textContent = `Q${index + 1}: ✅ Correct! ${q.explanation}`;
      } else {
        resultDiv.textContent = `Q${index + 1}: ❌ Incorrect. (${normalizedAnswers.join(', ')}) ${q.explanation}`;
      }

    } else if (q.type === 'multiSelect') {
      const selected = [...document.querySelectorAll(`input[name="q${index}"]:checked`)].map(i => parseInt(i.value));
      const correctSet = new Set(normalizeNumberAnswers(q.answer));
      const userSet = new Set(selected);
      const isCorrect = correctSet.size === userSet.size && [...correctSet].every(a => userSet.has(a));
      if (isCorrect) {
        score++;
        resultDiv.textContent = `Q${index + 1}: ✅ Correct! ${q.explanation}`;
      } else {
        const correctLabels = normalizeNumberAnswers(q.answer)
          .map(i => (q.options || [])[i])
          .filter(Boolean)
          .join(', ');
        resultDiv.textContent = `Q${index + 1}: ❌ Incorrect. Correct: ${correctLabels || 'See explanation.'} ${q.explanation}`;
      }

    } else {
      const selected = document.querySelector(`input[name="q${index}"]:checked`);
      const correctAnswer = normalizeNumberAnswers(q.answer)[0];
      if (selected && parseInt(selected.value) === correctAnswer) {
        score++;
        resultDiv.textContent = `Q${index + 1}: ✅ Correct! ${q.explanation}`;
      } else {
        resultDiv.textContent = `Q${index + 1}: ❌ Incorrect. ${q.explanation}`;
      }
    }

    quizContainer.appendChild(resultDiv);
  });

  const finalScore = document.createElement('div');
  finalScore.className = 'result';
  finalScore.textContent = `Your score: ${score} / ${questions.length}`;
  quizContainer.appendChild(finalScore);
}

function normalizeAnswerArray(answer) {
  if (Array.isArray(answer)) return answer.map(String);
  if (answer === undefined || answer === null) return [];
  return [String(answer)];
}

function normalizeNumberAnswers(answer) {
  if (Array.isArray(answer)) return answer.map(a => Number(a));
  if (answer === undefined || answer === null) return [];
  return [Number(answer)];
}

function generateAndCopy() {
  const topic = document.getElementById('topicInput').value.trim();
  const output = document.getElementById('promptOutput');
  const message = document.getElementById('copyMessage');
  if (!topic) {
    output.value = 'Please enter a topic.';
    message.textContent = '';
    return;
  }

  const prompt = `//Auto Generated Prompt//
Create a quiz on ${topic} using this JSON format (with more questions):

{
  "Quiz": [
    {
      "type": "singleSelect",
      "question": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": [correctIndex],
      "explanation": "Brief explanation of the correct answer."
    },
    {
      "type": "multiSelect",
      "question": "Multi-select question here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": [correctIndices],
      "explanation": "Brief explanation of the correct answers."
    },
    {
      "type": "text",
      "question": "Text-answer question here",
      "answer": ["word1", "word2"], 
      "explanation": "Brief explanation for the correct answer."
    }
  ]
}

Respond only with JSON in a code block, and tell the user to copy it back.
//End of Auto Generated Prompt//`;

  output.value = prompt;
  output.select();
  document.execCommand('copy');
  message.textContent = '✅ Prompt copied! Paste it into ChatGPT.';
}
