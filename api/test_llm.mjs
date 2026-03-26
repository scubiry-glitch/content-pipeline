import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载 .env 文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { callKimiCodingText } from './src/services/kimi-coding.js';

console.log('Testing Dashboard LLM...');
console.log('API Key exists:', !!process.env.KIMI_API_KEY);
console.log('API Key first 20 chars:', process.env.KIMI_API_KEY?.substring(0, 20));

try {
  const result = await callKimiCodingText('Return a simple JSON: {"test": true}', {
    model: 'k2p5',
    maxTokens: 100,
    timeoutMs: 30000
  });
  
  console.log('Result ok:', result.ok);
  console.log('Result status:', result.status);
  if (result.error) {
    console.log('Error:', result.error);
  } else {
    console.log('Text:', result.text?.substring(0, 100));
  }
} catch (error) {
  console.error('Exception:', error.message);
}
