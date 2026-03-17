// v3.4 文件存储服务
import fs from 'fs/promises';
import path from 'path';
import { MultipartFile } from '@fastify/multipart';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// 确保上传目录存在
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// 保存上传文件
export async function saveUploadFile(file: MultipartFile): Promise<string> {
  await ensureUploadDir();

  const id = uuidv4();
  const ext = path.extname(file.filename) || '.pdf';
  const filename = `${id}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // 写入文件
  const buffer = await file.toBuffer();
  await fs.writeFile(filepath, buffer);

  return filepath;
}

// 获取文件路径
export async function getFilePath(filename: string): Promise<string | null> {
  const filepath = path.join(UPLOAD_DIR, filename);

  try {
    await fs.access(filepath);
    return filepath;
  } catch {
    return null;
  }
}

// 删除文件
export async function deleteFile(filename: string): Promise<boolean> {
  const filepath = path.join(UPLOAD_DIR, filename);

  try {
    await fs.unlink(filepath);
    return true;
  } catch {
    return false;
  }
}
