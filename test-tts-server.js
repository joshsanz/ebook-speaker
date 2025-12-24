// Test script to verify TTS server connectivity

async function testTTS(sentence, model, voice) {
  console.log(`\nTesting ${model} model with ${voice} voice...`);

  try {
    const response = await fetch('http://localhost:5005/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: sentence,
        voice,
        response_format: 'wav',
        speed: 1.0
      })
    });

    if (response.ok) {
      console.log(`✅ ${model}/${voice} responded correctly`);
      console.log('Response status:', response.status);
      console.log('Content-Type:', response.headers.get('content-type'));

      const audioBuffer = await response.arrayBuffer();
      console.log('Audio data size:', audioBuffer.byteLength, 'bytes');
    } else {
      console.log(`❌ ${model}/${voice} responded with error:`, response.status, response.statusText);
    }
  } catch (error) {
    console.log(`❌ Failed to test ${model}/${voice}:`, error.message);
  }
}

async function runTests() {
  console.log('Starting TTS server tests...');

  const tests = [
    {
      sentence: 'Hello world! This is a test of the Kokoro TTS system.',
      model: 'kokoro',
      voice: 'af_heart'
    },
    {
      sentence: 'Hello world! This is a test of the Supertonic TTS system.',
      model: 'supertonic',
      voice: 'M1'
    }
  ];

  for (const test of tests) {
    await testTTS(test.sentence, test.model, test.voice);
  }

  console.log('\n✅ All tests completed');
}

runTests().catch(error => {
  console.error('Test runner error:', error.message);
  console.log('\nPlease ensure:');
  console.log('1. TTS server is running on port 5005');
  console.log('2. Server accepts CORS requests from localhost:3000');
  console.log('3. Server implements the OpenAI /v1/audio/speech API format');
});
