type Input = { originalText: string };
const body = JSON.parse('{"originalText":42}') as Input;
console.log('actual type:', typeof body.originalText);
console.log(body.originalText.trim());
