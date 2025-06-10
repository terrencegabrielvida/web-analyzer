const urlInput = document.getElementById('url') as HTMLInputElement;
const questionInput = document.getElementById('question') as HTMLInputElement;
const result = document.getElementById('result') as HTMLElement;
const button = document.getElementById('analyzeBtn') as HTMLButtonElement;

console.log("✅ Frontend loaded");

button.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const question = questionInput.value.trim();

  if (!url || !question) {
    result.textContent = '❗ Please enter both URL and question.';
    return;
  }

  result.textContent = '⏳ Analyzing...';

  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, question }),
    });

    const data = await res.json();

    result.textContent = data.answer || data.error || '⚠️ No response';
  } catch (err) {
    console.error(err);
    result.textContent = '🚫 Failed to send request.';
  }
});
