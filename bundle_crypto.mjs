import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [mode, source, destination] = process.argv.slice(2);
const encodedKey = process.env.NYA_3D_BUNDLE_KEY_B64;
if (!encodedKey) throw new Error('暗号鍵が未設定です。');
const key = Buffer.from(encodedKey, 'base64');
if (key.length !== 32 || key.toString('base64') !== encodedKey) throw new Error('暗号鍵の形式が不正です。');
const magic = Buffer.from('NYA3D01');
const aad = Buffer.from('harbour-nya-3d-bundle-v1');
const root = path.resolve(source);

function gather(directory, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('連結ファイルは梱包できません。');
    if (entry.isDirectory()) files.push(...gather(full, name));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(full);
      files.push({name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64')});
    }
  }
  return files;
}

if (mode === 'pack') {
  const files = gather(root);
  if (!files.length) throw new Error('梱包するファイルがありません。');
  const plain = Buffer.from(JSON.stringify({version: 1, files}));
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const result = Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext]);
  fs.writeFileSync(destination, result, {flag: 'wx'});
  console.log('暗号化して保存しました。');
} else if (mode === 'unpack') {
  const bytes = fs.readFileSync(source);
  if (bytes.length < 36 || !bytes.subarray(0, 7).equals(magic)) throw new Error('梱包形式が不正です。');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(7, 19));
  decipher.setAAD(aad);
  decipher.setAuthTag(bytes.subarray(19, 35));
  const plain = Buffer.concat([decipher.update(bytes.subarray(35)), decipher.final()]);
  const archive = JSON.parse(plain);
  if (archive.version !== 1 || !Array.isArray(archive.files)) throw new Error('梱包内容が不正です。');
  const output = path.resolve(destination);
  const seen = new Set();
  const verified = archive.files.map(file => {
    if (typeof file.name !== 'string' || file.name.includes('\\') || path.isAbsolute(file.name)) throw new Error('保存場所が不正です。');
    const target = path.resolve(output, file.name);
    const relative = path.relative(output, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || seen.has(target)) throw new Error('保存場所が重複または範囲外です。');
    seen.add(target);
    const data = Buffer.from(file.data, 'base64');
    if (data.length !== file.size || crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('内容の照合値が不一致です。');
    if (fs.existsSync(target)) throw new Error('既存ファイルを上書きできません。');
    return {target, data};
  });
  fs.mkdirSync(output, {recursive: true});
  for (const file of verified) {
    fs.mkdirSync(path.dirname(file.target), {recursive: true});
    fs.writeFileSync(file.target, file.data, {flag: 'wx'});
  }
  console.log('復号と内容の照合が完了しました。');
} else {
  throw new Error('pack または unpack を指定してください。');
}
