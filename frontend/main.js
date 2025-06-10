var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const urlInput = document.getElementById('url');
const questionInput = document.getElementById('question');
const result = document.getElementById('result');
const button = document.getElementById('analyzeBtn');
console.log("✅ Frontend loaded");
button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
    const url = urlInput.value.trim();
    const question = questionInput.value.trim();
    if (!url || !question) {
        result.textContent = '❗ Please enter both URL and question.';
        return;
    }
    result.textContent = '⏳ Analyzing...';
    try {
        const res = yield fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, question }),
        });
        const data = yield res.json();
        result.textContent = data.answer || data.error || '⚠️ No response';
    }
    catch (err) {
        console.error(err);
        result.textContent = '🚫 Failed to send request.';
    }
}));
