import dotenv from 'dotenv';
dotenv.config();

console.log('From pipeline directory:');
console.log('KIMI_API_KEY exists:', !!process.env.KIMI_API_KEY);
console.log('First 20 chars:', process.env.KIMI_API_KEY?.substring(0, 20));
