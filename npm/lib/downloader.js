/**
 * Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 OR Commercial-License
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AVAILABLE_MODELS = {
  'bitnet-2b': {
    repo: 'microsoft/bitnet-b1.58-2B-4T-gguf',
    file: 'ggml-model-i2_s.gguf',
    url: 'https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf',
    sizeMb: 1132.8,
    description: 'Microsoft BitNet b1.58 2B-4T (Official i2_s quantized, 1.13 GB) - Recommended for Mobile ARM64',
  },
  'bitnet-large': {
    repo: 'RichardErkhov/1bitLLM_-_bitnet_b1_58-large-gguf',
    file: 'bitnet_b1_58-large.Q4_0.gguf',
    url: 'https://huggingface.co/RichardErkhov/1bitLLM_-_bitnet_b1_58-large-gguf/resolve/main/bitnet_b1_58-large.Q4_0.gguf',
    sizeMb: 404.5,
    description: 'BitNet b1.58 Large 0.7B (Q4_0 quantized, 404 MB) - Ultra-lightweight',
  },
  'bitnet-3b': {
    repo: 'Green-Sky/bitnet_b1_58-3B-GGUF',
    file: 'bitnet_b1_58-3B.q1_3.gguf',
    url: 'https://huggingface.co/Green-Sky/bitnet_b1_58-3B-GGUF/resolve/main/bitnet_b1_58-3B.q1_3.gguf',
    sizeMb: 730.4,
    description: 'BitNet b1.58 3.3B (q1_3 quantized, 730 MB) - High-capacity Mobile Model',
  },
  'bitnet-3b-q4': {
    repo: 'RichardErkhov/1bitLLM_-_bitnet_b1_58-3B-gguf',
    file: 'bitnet_b1_58-3B.Q4_0.gguf',
    url: 'https://huggingface.co/RichardErkhov/1bitLLM_-_bitnet_b1_58-3B-gguf/resolve/main/bitnet_b1_58-3B.Q4_0.gguf',
    sizeMb: 1834.5,
    description: 'BitNet b1.58 3.3B (Q4_0 quantized, 1.83 GB) - High precision 3B model',
  }
};

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'termux-bitnet', 'models');

function listModels() {
  console.log('=========================================================================');
  console.log('       termux-bitnet Verified 1.58-bit GGUF Model Registry               ');
  console.log('=========================================================================');
  for (const [alias, info] of Object.entries(AVAILABLE_MODELS)) {
    console.log(`  * ${alias.padEnd(15)} : ${info.description}`);
    console.log(`    - URL  : ${info.url}`);
    console.log(`    - Size : ${info.sizeMb.toFixed(1)} MB`);
  }
  console.log('=========================================================================');
}

function followRedirects(url, headers, onResponse, onError) {
  const req = https.get(url, { headers }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return followRedirects(res.headers.location, headers, onResponse, onError);
    }
    onResponse(res);
  });
  req.on('error', onError);
}

function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findClosestModelAlias(name) {
  const keys = Object.keys(AVAILABLE_MODELS);
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestKey = null;
  let minDistance = Infinity;

  for (const k of keys) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dist = levenshteinDistance(clean, cleanK);
    if (dist < minDistance && dist <= 3) {
      minDistance = dist;
      bestKey = k;
    }
  }
  return bestKey;
}

async function downloadModel(modelName = 'bitnet-2b', outputDir = null, force = false) {
  if (!modelName || !modelName.trim()) {
    throw new Error(
      `[termux-bitnet ERROR] Model name cannot be empty.\n` +
      `Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`
    );
  }

  const cleanName = modelName.trim();
  if (!AVAILABLE_MODELS[cleanName]) {
    const closest = findClosestModelAlias(cleanName);
    if (closest) {
      throw new Error(
        `[termux-bitnet ERROR] Model alias typo detected: '${cleanName}'. Did you mean '${closest}'?\n` +
        `Available verified models: ${Object.keys(AVAILABLE_MODELS).join(', ')}\n` +
        `Run: termux-bitnet download ${closest}`
      );
    } else {
      throw new Error(
        `[termux-bitnet ERROR] Unknown model alias '${cleanName}'.\n` +
        `Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}\n` +
        `Run 'termux-bitnet models' to inspect available models.`
      );
    }
  }

  const modelInfo = AVAILABLE_MODELS[modelName];
  const targetDir = outputDir || DEFAULT_CACHE_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, `${modelName}-${modelInfo.file}`);

  if (!force && fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`[termux-bitnet] Model already cached at: ${targetPath} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)`);
      return targetPath;
    }
  }

  console.log(`[termux-bitnet] Downloading ${modelInfo.description}...`);
  console.log(`[termux-bitnet] Remote URL : ${modelInfo.url}`);
  console.log(`[termux-bitnet] Target Path: ${targetPath}`);

  return new Promise((resolve, reject) => {
    let downloaded = 0;
    const headers = { 'User-Agent': 'termux-bitnet/1.0.2 (Node.js; Android; ARM64)' };
    let mode = { flags: 'w' };

    if (fs.existsSync(targetPath) && !force) {
      downloaded = fs.statSync(targetPath).size;
      headers['Range'] = `bytes=${downloaded}-`;
      mode = { flags: 'a' };
    }

    followRedirects(modelInfo.url, headers, (res) => {
      if (res.statusCode === 416) {
        console.log(`[termux-bitnet] Download already complete: ${targetPath}`);
        return resolve(targetPath);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        return reject(new Error(`HTTP error ${res.statusCode} ${res.statusMessage}`));
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10) + (res.statusCode === 206 ? downloaded : 0);
      const fileStream = fs.createWriteStream(targetPath, mode);

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloaded / totalSize) * 100).toFixed(2);
          const mbDone = (downloaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
          process.stdout.write(`\r  [Progress]: [${percent.padStart(6)}%] (${mbDone.padStart(6)}/${mbTotal.padStart(6)} MB)`);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`\n[termux-bitnet] Download successfully completed: ${targetPath}`);
        resolve(targetPath);
      });

      fileStream.on('error', (err) => {
        fs.unlink(targetPath, () => {});
        reject(err);
      });
    }, reject);
  });
}

module.exports = {
  AVAILABLE_MODELS,
  DEFAULT_CACHE_DIR,
  listModels,
  downloadModel,
};
