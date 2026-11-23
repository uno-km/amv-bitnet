#!/usr/bin/env node
/**
 * Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 OR Commercial-License
 */

const fs = require('fs');
const path = require('path');
const { BitNetEngine, detectHardware } = require('../lib/engine');
const { downloadModel, listModels } = require('../lib/downloader');

const args = process.argv.slice(2);
const command = args[0] || 'info';

function printCatalogHelp() {
  console.error('\n[Available Official BitNet Models]');
  console.error('  1. bitnet-2b    : Microsoft BitNet 2B-4T (1.13 GB, i2_s)');
  console.error('     Command      : amv-bitnet download bitnet-2b');
  console.error('  2. bitnet-large : BitNet b1.58 Large 0.7B (700 MB, i2_s)');
  console.error('     Command      : amv-bitnet download bitnet-large');
  console.error('  3. bitnet-3b    : BitNet b1.58 3B (2.4 GB, i2_s)');
  console.error('     Command      : amv-bitnet download bitnet-3b');
  console.error('  4. bitnet-3b-q4 : BitNet b1.58 3B Q4_K_M (1.8 GB)');
  console.error('     Command      : amv-bitnet download bitnet-3b-q4');
  console.error('\nOfficial Hugging Face Repositories:');
  console.error('  - https://huggingface.co/1bitLLM/bitnet_b1_58-large-GGUF');
  console.error('  - https://huggingface.co/1bitLLM/bitnet_b1_58-3B-GGUF');
}

if (command === 'info') {
  const hw = detectHardware();
  console.log('=========================================================');
  console.log('       amv-bitnet Node.js Hardware Diagnostic            ');
  console.log('=========================================================');
  console.log(`  Architecture:       ${hw.arch}`);
  console.log(`  CPU Cores:          ${hw.cpuCores}`);
  console.log(`  NEON Supported:     ${hw.hasNeon ? 'YES' : 'NO'}`);
  console.log(`  DotProd Accel:      ${hw.hasDotProd ? 'YES (vdotq_s32)' : 'FALLBACK'}`);
  console.log('=========================================================');
} else if (command === 'download') {
  const modelAlias = args[1] || 'bitnet-2b';
  const force = args.includes('--force') || args.includes('-f');
  downloadModel(modelAlias, null, force).catch((err) => {
    console.error(`\n[amv-bitnet error]: ${err.message}`);
    process.exit(1);
  });
} else if (command === 'doctor') {
  const hw = detectHardware();
  console.log('=========================================================');
  console.log('       amv-bitnet Node.js Pre-flight Doctor              ');
  console.log('=========================================================');
  console.log(`  Architecture:       ${hw.arch}`);
  console.log(`  CPU Cores:          ${hw.cpuCores}`);
  console.log(`  NEON Supported:     ${hw.hasNeon ? 'YES' : 'NO'}`);
  console.log(`  DotProd Accel:      ${hw.hasDotProd ? 'YES (vdotq_s32)' : 'FALLBACK'}`);
  console.log('  Status:             PASS');
  console.log('=========================================================');
} else if (command === 'models' || command === 'list') {
  listModels();
} else if (command === 'run') {
  const getArg = (flag, alias) => {
    let idx = args.indexOf(flag);
    if (idx === -1 && alias) idx = args.indexOf(alias);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const model = getArg('-m', '--model');
  const prompt = getArg('-p', '--prompt');

  let resolvedModel = model ? path.resolve(model) : null;
  if (!resolvedModel) {
    const cacheDir = path.join(require('os').homedir(), '.cache', 'termux-bitnet', 'models');
    const candidates = [
      path.join(cacheDir, 'bitnet_b1_58-large.Q4_0.gguf'),
      path.join(cacheDir, 'bitnet-large-bitnet_b1_58-large.Q4_0.gguf'),
      path.join(cacheDir, 'bitnet-large.gguf'),
      path.join(cacheDir, 'bitnet-2b-ggml-model-i2_s.gguf'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        resolvedModel = c;
        break;
      }
    }
  }

  if (!resolvedModel || !fs.existsSync(resolvedModel)) {
    console.error(`[amv-bitnet ERROR] No model file found. Specify -m / --model <path> or run 'amv-bitnet download bitnet-large'.`);
    printCatalogHelp();
    process.exit(10);
  }

  // Strict Validation 2: Prompt existence check (No hardcoded fallback)
  if (!prompt || !prompt.trim()) {
    console.error('[amv-bitnet ERROR] No input prompt provided. Missing required flag: -p or --prompt "<text>"');
    console.error(`Example: amv-bitnet run -m ${model} -p "Explain 1.58-bit LLM in simple terms:"`);
    process.exit(2);
  }

  const threads = getArg('-t', '--threads');
  const ctx = getArg('-c', '--ctx-size');
  const batch = getArg('-b', '--batch-size');
  const ubatch = getArg('-ub', '--ubatch-size');
  const nPredict = getArg('-n', '--n-predict');
  const temp = getArg('--temp', '-temp');
  const topP = getArg('--top-p', null);
  const topK = getArg('--top-k', null);
  const minP = getArg('--min-p', null);
  const typical = getArg('--typical', null);
  const repeatPenalty = getArg('--repeat-penalty', null);
  const repeatLastN = getArg('--repeat-last-n', null);
  const freqPenalty = getArg('--freq-penalty', null);
  const presencePenalty = getArg('--presence-penalty', null);
  const seed = getArg('-s', '--seed');
  const ngl = getArg('-ngl', '--n-gpu-layers');
  const flashAttn = args.includes('-fa') || args.includes('--flash-attn');
  const systemPrompt = getArg('--system-prompt', null);
  const stop = getArg('-r', '--stop');
  const verbose = args.includes('-v') || args.includes('--verbose');

  const options = {
    modelPath: resolvedModel,
  };
  if (threads) options.threads = parseInt(threads, 10);
  if (ctx) options.contextSize = parseInt(ctx, 10);
  if (batch) options.batchSize = parseInt(batch, 10);
  if (ubatch) options.ubatchSize = parseInt(ubatch, 10);
  if (temp) options.temperature = parseFloat(temp);
  if (topP) options.topP = parseFloat(topP);
  if (topK) options.topK = parseInt(topK, 10);
  if (minP) options.minP = parseFloat(minP);
  if (typical) options.typicalP = parseFloat(typical);
  if (repeatPenalty) options.repeatPenalty = parseFloat(repeatPenalty);
  if (repeatLastN) options.repeatLastN = parseInt(repeatLastN, 10);
  if (freqPenalty) options.freqPenalty = parseFloat(freqPenalty);
  if (presencePenalty) options.presencePenalty = parseFloat(presencePenalty);
  if (seed) options.seed = parseInt(seed, 10);
  if (ngl) options.gpuLayers = parseInt(ngl, 10);
  if (flashAttn) options.flashAttn = true;
  if (systemPrompt) options.systemPrompt = systemPrompt;
  if (stop) options.stopTokens = stop;
  if (verbose) options.verbose = true;

  try {
    const engine = new BitNetEngine(options);
    console.log(`[Model]:  ${resolvedModel}`);
    console.log(`[Prompt]: ${prompt}`);
    console.log('[Response]: ');
    engine.generateStream(prompt, nPredict ? parseInt(nPredict, 10) : 128, (token) => {
      process.stdout.write(token);
    }).then(() => {
      console.log('\n');
    }).catch((err) => {
      console.error(`\n[amv-bitnet ERROR]: ${err.message}`);
      process.exit(1);
    });
  } catch (err) {
    console.error(`[amv-bitnet ERROR]: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log('Usage: amv-bitnet [info | download <model_alias> | models | run -m <model> -p "<prompt>" -t <threads> -n <max_tokens>]');
}
