/**
 * Copyright (c) 2026 Uno Kim / AMEVA Foundation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0 OR Commercial-License
 */
/**
 * @file index.js
 * @brief termux-bitnet Node.js / TypeScript Package Main Entry Point.
 */

const { BitNetEngine, detectHardware } = require('./lib/engine');
const { downloadModel, listModels, AVAILABLE_MODELS } = require('./lib/downloader');

function createEngine(options = {}) {
  return new BitNetEngine(options);
}

module.exports = {
  createEngine,
  BitNetEngine,
  detectHardware,
  downloadModel,
  listModels,
  AVAILABLE_MODELS,
};
