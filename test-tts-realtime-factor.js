#!/usr/bin/env node

/**
 * Measures the real-time factor (RTF) of the TTS service for varying sentence lengths.
 * RTF = synthesis_time_seconds / audio_duration_seconds
 *
 * Usage:
 *   node test-tts-realtime-factor.js
 *
 * Optional environment variables:
 *   TTS_BENCHMARK_BASE_URL   Base URL for the TTS service (default: http://localhost:5005)
 *   TTS_BENCHMARK_MODEL      Model to request (default: kokoro)
 *   TTS_BENCHMARK_VOICE      Voice to request (default: mia)
 *   TTS_BENCHMARK_SPEED      Playback speed (default: 1.0)
 *   TTS_BENCHMARK_SENTENCES  Path to the JSON sentence file (default: tts/tts-benchmark-sentences.json)
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const DEFAULT_SENTENCE_PATH = path.join(__dirname, 'tts', 'tts-benchmark-sentences.json');
const SENTENCE_PATH = process.env.TTS_BENCHMARK_SENTENCES || DEFAULT_SENTENCE_PATH;
const BASE_URL = (process.env.TTS_BENCHMARK_BASE_URL || 'http://localhost:5005').replace(/\/$/, '');
const ENDPOINT = `${BASE_URL}/v1/audio/speech`;
const MODEL = process.env.TTS_BENCHMARK_MODEL || 'kokoro';
const VOICE = process.env.TTS_BENCHMARK_VOICE || 'mia';
const SPEED = parseFloat(process.env.TTS_BENCHMARK_SPEED || '1.0');

function loadSentences(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sentence file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  ['short', 'medium', 'long'].forEach((category) => {
    if (!Array.isArray(parsed[category]) || parsed[category].length === 0) {
      throw new Error(`Sentence file is missing entries for category "${category}"`);
    }
  });

  return parsed;
}

function parseWavDuration(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Unexpected audio format (expected WAV RIFF header)');
  }

  let offset = 12;
  let sampleRate;
  let bitsPerSample;
  let numChannels;
  let dataChunkSize;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataChunkSize = chunkSize;
      break;
    }

    // Chunks are word aligned; pad byte if chunkSize is odd.
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !bitsPerSample || !numChannels || !dataChunkSize) {
    throw new Error('Failed to read necessary WAV metadata from audio response');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * numChannels;
  return dataChunkSize / (sampleRate * frameSize);
}

function formatSeconds(value) {
  return `${value.toFixed(2)}s`;
}

async function measureSentence(fetch, sentence) {
  const requestBody = {
    model: MODEL,
    input: sentence,
    voice: VOICE,
    response_format: 'wav',
    speed: SPEED
  };

  const start = performance.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  const end = performance.now();

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TTS service responded with ${response.status} ${response.statusText}: ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  const audioDurationSeconds = parseWavDuration(audioBuffer);
  const processingSeconds = (end - start) / 1000;
  const rtf = processingSeconds / audioDurationSeconds;

  return {
    processingSeconds,
    audioDurationSeconds,
    realTimeFactor: rtf,
    bytes: audioBuffer.length
  };
}

async function main() {
  const { default: fetch } = await import('node-fetch');
  const sentencesByCategory = loadSentences(SENTENCE_PATH);

  console.log('==============================================');
  console.log('TTS Real-Time Factor Benchmark');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Model: ${MODEL} | Voice: ${VOICE} | Speed: ${SPEED}`);
  console.log(`Sentence file: ${SENTENCE_PATH}`);
  console.log('==============================================');

  for (const [category, sentences] of Object.entries(sentencesByCategory)) {
    console.log(`\n--- ${category.toUpperCase()} (${sentences.length} sentences) ---`);
    let totalProcessing = 0;
    let totalAudio = 0;
    let totalRtf = 0;
    let completed = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      try {
        const result = await measureSentence(fetch, sentence);
        totalProcessing += result.processingSeconds;
        totalAudio += result.audioDurationSeconds;
        totalRtf += result.realTimeFactor;
        completed += 1;

        console.log(
          `#${i + 1}`.padEnd(4),
          `${formatSeconds(result.processingSeconds)} req`,
          '|',
          `${formatSeconds(result.audioDurationSeconds)} audio`,
          '| RTF',
          result.realTimeFactor.toFixed(2),
          `| ${result.bytes} bytes`
        );
      } catch (error) {
        console.error(`#${i + 1} ERROR:`, error.message);
      }
    }

    if (completed === 0) {
      console.log('No successful measurements for this category.');
      continue;
    }

    const avgProcessing = totalProcessing / completed;
    const avgAudio = totalAudio / completed;
    const avgRtf = totalRtf / completed;

    console.log(`Average processing: ${formatSeconds(avgProcessing)} (${completed} samples)`);
    console.log(`Average audio length: ${formatSeconds(avgAudio)}`);
    console.log(`Average RTF: ${avgRtf.toFixed(2)}`);
  }

  console.log('\nBenchmark complete.');
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exitCode = 1;
});
