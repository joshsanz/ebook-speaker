 1. Keys & values

  - Audio cache key: tts:{bookId}:{model}:{voice}:{speed}:{sentenceHash}
  - Value: raw bytes (Buffer) if client supports it; fallback base64.
  - TTL: 24h (EX 86400)
  - Lock key: lock:tts:{bookId}:{model}:{voice}:{speed}:{sentenceHash} with token value, TTL 60s.
  - Queues:
      - Prefetch (high priority): queue:tts:prefetch:{bookId}
      - Chapter (normal): queue:tts:chapter:{bookId}

  2. Queue payload

  - Compact JSON string containing:
      - bookId, chapterId, model, voice, speed, sentence
  - If size is a concern, store text separately and enqueue only IDs; otherwise keep text in queue payload.

  3. Enqueue behavior

  - On chapter open:
      - Enqueue all sentences for current chapter and next chapter into queue:tts:chapter:{bookId}.
  - On chapter change:
      - DEL queue:tts:prefetch:{bookId} and DEL queue:tts:chapter:{bookId}.
      - Re-enqueue current + next chapter.
  - On page open:
      - Enqueue next 15 sentences from current chapter into queue:tts:prefetch:{bookId} (highest priority).
  - Track active book queues in queue:tts:books to allow a single worker to discover keys.

  4. Worker loop (single worker, priority)

  - Always drain prefetch queue first:
      - BLPOP queue:tts:prefetch:{bookId} 1
      - If empty or timeout, then BLPOP queue:tts:chapter:{bookId} 1
  - Worker pulls active book IDs from queue:tts:books and builds the key list each loop.
  - For each job:
      1. Check cache GET audioKey. If hit, skip.
      2. Acquire lock: SET lockKey token NX EX 60
          - If lock fails, skip.
      3. Call TTS, store audio: SET audioKey bytes EX 86400
      4. Release lock safely with Lua:
          - if GET lockKey == token then DEL lockKey end

  5. Race avoidance

  - Pop from queue first, then check cache just before TTS. This avoids duplicates even with prefetch being higher priority.

  6. Prefetch scope

  - Only next 15 sentences in current chapter.
  - Chapter queues include full current + next chapter for buffer.
