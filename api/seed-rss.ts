import { query } from './src/db/connection';
import crypto from 'crypto';

const sampleArticles = [
  { title: "AI Model Achieves Human-Level Performance on Medical Diagnostics", source: "Tech Review", link: "https://example.com/ai-medical-1" },
  { title: "New Battery Technology Promises 10x Capacity Increase", source: "MIT Tech Review", link: "https://example.com/battery-1" },
  { title: "SpaceX Successfully Tests New Starship Prototype", source: "The Verge", link: "https://example.com/spacex-1" },
  { title: "Global Semiconductor Shortage Shows Signs of Easing", source: "BBC Technology", link: "https://example.com/chip-1" },
  { title: "OpenAI Releases GPT-5 with Multimodal Capabilities", source: "Ars Technica", link: "https://example.com/gpt5-1" },
  { title: "Quantum Computer Breaks Encryption Record", source: "Nature News", link: "https://example.com/quantum-1" },
  { title: "Apple Announces New AR Glasses for 2027", source: "The Verge", link: "https://example.com/apple-ar-1" },
  { title: "Google DeepMind Solves Protein Folding Challenge", source: "MIT Tech Review", link: "https://example.com/deepmind-1" },
  { title: "Tesla Unveils Revolutionary Robotaxi Service", source: "Tech Review", link: "https://example.com/tesla-1" },
  { title: "Meta's New VR Headset Gets Mixed Reviews", source: "Slashdot", link: "https://example.com/meta-vr-1" },
  { title: "Amazon Deploys Delivery Drones in Major Cities", source: "BBC Technology", link: "https://example.com/amazon-drone-1" },
  { title: "Microsoft Azure Outage Affects Millions", source: "Ars Technica", link: "https://example.com/azure-1" },
  { title: "NVIDIA Announces Next-Gen AI Chips", source: "The Verge", link: "https://example.com/nvidia-1" },
  { title: "Hackers Steal $100M from Crypto Exchange", source: "Slashdot", link: "https://example.com/crypto-hack-1" },
  { title: "China Launches New Space Station Module", source: "BBC Technology", link: "https://example.com/china-space-1" },
  { title: "EU Passes Sweeping AI Regulation Bill", source: "Tech Review", link: "https://example.com/eu-ai-1" },
  { title: "Google Faces Antitrust Breakup Threat", source: "Ars Technica", link: "https://example.com/google-antitrust-1" },
  { title: "Apple vs Epic Games Lawsuit Continues", source: "Slashdot", link: "https://example.com/apple-epic-1" },
  { title: "Intel Plans Major Chip Factory Expansion", source: "MIT Tech Review", link: "https://example.com/intel-1" },
  { title: "Ransomware Attack Hits Hospital Network", source: "BBC Technology", link: "https://example.com/ransomware-1" },
  { title: "New LLM Trained on 10 Trillion Tokens", source: "The Verge", link: "https://example.com/llm-1" },
  { title: "5G Network Coverage Reaches Rural Areas", source: "Tech Review", link: "https://example.com/5g-1" },
  { title: "Self-Driving Cars Face Regulatory Hurdles", source: "MIT Tech Review", link: "https://example.com/autonomous-1" },
  { title: "AI-Generated Content Floods Social Media", source: "Ars Technica", link: "https://example.com/ai-content-1" },
  { title: "Blockchain Energy Consumption Under Scrutiny", source: "Slashdot", link: "https://example.com/blockchain-1" },
  { title: "Apple iPhone Sales Beat Expectations", source: "The Verge", link: "https://example.com/iphone-1" },
  { title: "Microsoft Office Gets AI Copilot Features", source: "BBC Technology", link: "https://example.com/office-ai-1" },
  { title: "Twitter Rebranding to X Confuses Users", source: "Slashdot", link: "https://example.com/twitter-x-1" },
  { title: "Solar Panel Efficiency Breakthrough Achieved", source: "MIT Tech Review", link: "https://example.com/solar-1" },
  { title: "Amazon Acquires Healthcare Startup", source: "Tech Review", link: "https://example.com/amazon-health-1" },
];

async function seed() {
  let inserted = 0;
  
  for (const article of sampleArticles) {
    const id = crypto.createHash('md5').update(article.link).digest('hex');
    const sourceId = article.source.toLowerCase().replace(/\s+/g, '-');
    
    try {
      await query(
        `INSERT INTO rss_items (
          id, source_id, source_name, title, link, content, summary,
          published_at, author, categories, tags, relevance_score, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          id,
          sourceId,
          article.source,
          article.title,
          article.link,
          'Sample content for ' + article.title,
          'Summary of ' + article.title,
          'Auto Reporter',
          JSON.stringify(['tech', 'news']),
          JSON.stringify(['AI', 'tech']),
          0.7
        ]
      );
      inserted++;
    } catch (e: any) {
      console.log('Error: ' + e.message);
    }
  }
  
  console.log('Inserted ' + inserted + ' articles');
  
  // Show count
  const result = await query('SELECT COUNT(*) FROM rss_items');
  console.log('Total RSS items: ' + result.rows[0].count);
}

seed();
