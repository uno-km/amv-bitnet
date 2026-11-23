/**
 * Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 OR Commercial-License
 */
/**
 * @file engine.js
 * @brief Node.js Thin Gateway around Native C++ BitNet Core Engine (Strict Validation).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function detectHardware() {
  const arch = os.arch();
  const cores = os.cpus().length || 4;
  let hasNeon = false;
  let hasDotProd = false;

  if (fs.existsSync('/proc/cpuinfo')) {
    try {
      const content = fs.readFileSync('/proc/cpuinfo', 'utf8').toLowerCase();
      if (content.includes('asimd') || content.includes('neon')) hasNeon = true;
      if (content.includes('asimddp') || content.includes('dotprod')) hasDotProd = true;
    } catch (_) {}
  } else if (arch === 'arm64') {
    hasNeon = true;
  }

  return {
    arch,
    hasNeon,
    hasDotProd,
    cpuCores: cores,
  };
}

class BitNetEngine {
  constructor(options = {}) {
    let resolvedModel = options.modelPath || '';
    if (!resolvedModel) {
      const cacheDir = path.join(os.homedir(), '.cache', 'termux-bitnet', 'models');
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
    } else {
      const fullPath = path.resolve(resolvedModel);
      if (!fs.existsSync(fullPath)) {
        throw new Error(
          `[termux-bitnet] Specified model file does not exist: '${fullPath}'.\n` +
          `Download official models using:\n` +
          `  termux-bitnet download bitnet-2b\n` +
          `  termux-bitnet download bitnet-large\n` +
          `  termux-bitnet download bitnet-3b\n` +
          `Or from Hugging Face: https://huggingface.co/1bitLLM/bitnet_b1_58-large-GGUF`
        );
      }
      resolvedModel = fullPath;
    }

    this.options = {
      modelPath: resolvedModel,
      systemPrompt: options.systemPrompt || '',
      stopTokens: options.stopTokens || '',
      threads: options.threads || 4,
      contextSize: options.contextSize || 512,
      batchSize: options.batchSize || 512,
      ubatchSize: options.ubatchSize || 512,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      topP: options.topP !== undefined ? options.topP : 0.95,
      topK: options.topK !== undefined ? options.topK : 40,
      minP: options.minP !== undefined ? options.minP : 0.05,
      typicalP: options.typicalP !== undefined ? options.typicalP : 1.0,
      repeatPenalty: options.repeatPenalty !== undefined ? options.repeatPenalty : 1.15,
      repeatLastN: options.repeatLastN !== undefined ? options.repeatLastN : 64,
      freqPenalty: options.freqPenalty !== undefined ? options.freqPenalty : 0.0,
      presencePenalty: options.presencePenalty !== undefined ? options.presencePenalty : 0.0,
      seed: options.seed !== undefined ? options.seed : 0,
      flashAttn: options.flashAttn || false,
      gpuLayers: options.gpuLayers || 0,
      verbose: options.verbose || false,
    };
    this.cliPath = this._findNativeBinary();
  }

  _findNativeBinary() {
    const candidates = [
      path.join(os.homedir(), 'bin', 'llama-cli'),
      path.join(os.homedir(), '.local', 'bin', 'llama-cli'),
      '/data/data/com.termux/files/usr/bin/llama-cli',
      path.join(__dirname, '..', '..', 'build', 'termux-bitnet-cli'),
      path.join(__dirname, '..', '..', 'bin', 'termux-bitnet-cli'),
      '/data/data/com.termux/files/usr/bin/termux-bitnet-cli',
      '/usr/local/bin/termux-bitnet-cli',
      'llama-cli',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'llama-cli';
  }

  getHardwareInfo() {
    return detectHardware();
  }

  async generateStream(prompt, maxTokens = 128, onToken = null, timeoutMs = 120000) {
    if (!prompt || !prompt.trim()) {
      throw new Error('[termux-bitnet] Prompt cannot be empty. Please provide a valid prompt string.');
    }

    if (!this.options.modelPath) {
      throw new Error(
        '[termux-bitnet] No modelPath configured in BitNetEngine.\n' +
        'Please pass { modelPath: "/path/to/model.gguf" } or run "termux-bitnet download bitnet-large".'
      );
    }

    const safeMaxTokens = Math.max(1, Math.min(parseInt(maxTokens, 10) || 128, 4096));

    return new Promise((resolve, reject) => {
      const args = [
        '-m', this.options.modelPath,
        '-p', prompt,
        '-n', String(safeMaxTokens),
        '-t', String(this.options.threads),
        '-c', String(this.options.contextSize),
        '-b', String(this.options.batchSize),
        '-ub', String(this.options.ubatchSize),
        '--temp', String(this.options.temperature),
        '--top-p', String(this.options.topP),
        '--top-k', String(this.options.topK),
        '--min-p', String(this.options.minP),
        '--typical', String(this.options.typicalP),
        '--repeat-penalty', String(this.options.repeatPenalty),
        '--repeat-last-n', String(this.options.repeatLastN),
        '--freq-penalty', String(this.options.freqPenalty),
        '--presence-penalty', String(this.options.presencePenalty),
        '--simple-io',
        '--no-warmup',
      ];

      if (this.options.seed !== 0) {
        args.push('-s', String(this.options.seed));
      }
      if (this.options.gpuLayers > 0) {
        args.push('-ngl', String(this.options.gpuLayers));
      }
      if (this.options.flashAttn) {
        args.push('-fa');
      }
      if (this.options.systemPrompt) {
        args.push('--system-prompt', String(this.options.systemPrompt));
      }
      if (this.options.stopTokens) {
        for (const st of String(this.options.stopTokens).split(',')) {
          const trimmed = st.trim();
          if (trimmed) args.push('-r', trimmed);
        }
      }
      if (this.options.verbose) {
        args.push('--verbose');
      }

      let proc;
      try {
        proc = spawn(this.cliPath, args, {
          env: {
            ...process.env,
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8',
          }
        });
      } catch (err) {
        return reject(new Error(`Failed to spawn BitNet CLI binary at '${this.cliPath}': ${err.message}`));
      }

      let fullOutput = '';
      let errorOutput = '';
      let isCompleted = false;

      const timer = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          try {
            proc.kill('SIGTERM');
            setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch (_) {}
            }, 1000);
          } catch (_) {}
          reject(new Error(`[termux-bitnet] Inference execution timed out after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        const chunk = data.toString('utf8');
        fullOutput += chunk;
        if (onToken) onToken(chunk);
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString('utf8');
      });

      proc.on('close', (code) => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timer);

        if (code !== 0) {
          return reject(new Error(`Native BitNet CLI process exited with code ${code}.\n${errorOutput}`));
        }
        let clean = fullOutput;
        if (clean.startsWith(prompt)) {
          clean = clean.slice(prompt.length);
        } else {
          const idx = clean.indexOf(prompt);
          if (idx !== -1 && idx < 64) {
            clean = clean.slice(idx + prompt.length);
          }
        }
        resolve(clean.trim());
      });

      proc.on('error', (err) => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async generate(prompt, maxTokens = 128) {
    return this.generateStream(prompt, maxTokens);
  }
}

module.exports = {
  BitNetEngine,
  detectHardware,
};
