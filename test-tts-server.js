// Test script to verify TTS server connectivity
const fetch = require('node-fetch');

async function testTTSServer() {
  console.log('Testing TTS server connection...');

  try {
    const response = await fetch('http://localhost:5005/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world! This is a test of the TTS system.',
        voice: 'mia',
        response_format: 'wav',
        speed: 1.0
      })
    });

    if (response.ok) {
      console.log('✅ TTS server is responding correctly');
      console.log('Response status:', response.status);
      console.log('Content-Type:', response.headers.get('content-type'));

      const audioBuffer = await response.arrayBuffer();
      console.log('Audio data size:', audioBuffer.byteLength, 'bytes');
    } else {
      console.log('❌ TTS server responded with error:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Failed to connect to TTS server:', error.message);
    console.log('\nPlease ensure:');
    console.log('1. TTS server is running on port 5005');
    console.log('2. Server accepts CORS requests from localhost:3000');
    console.log('3. Server implements the OpenAI /v1/audio/speech API format');
  }
}

testTTSServer();
