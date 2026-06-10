"""Repro for the reconnect echo-eating race: a QUIET session (style set but
never played) disconnects; an immediate reconnect sends set_style; the echo
must arrive. With a thread-blocked pump read, the old session's zombie
get() can consume the new session's echo.

Run while the server is up: uv run python scripts/repro_reconnect_echo.py
"""

import asyncio
import json
import sys

from websockets.asyncio.client import connect

URL = "ws://127.0.0.1:8000/ws/deck/a"
ATTEMPTS = 10


async def attempt(index: int) -> bool:
    async with connect(URL, max_size=None) as ws:
        await ws.recv()  # hello
        await ws.send(json.dumps({"type": "set_prompt", "prompt": "quiet session"}))
        # Consume the echo so the queue is empty and quiet at disconnect.
        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            if isinstance(msg, str) and '"style_applied"' in msg:
                break

    # Immediate reconnect, like a page reload.
    async with connect(URL, max_size=None) as ws:
        await ws.recv()  # hello
        await ws.send(
            json.dumps(
                {
                    "type": "set_style",
                    "prompts": [{"text": "quiet session", "weight": 1}],
                }
            )
        )
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
                if isinstance(msg, str) and '"style_applied"' in msg:
                    print(f"attempt {index}: OK")
                    return True
        except TimeoutError:
            print(f"attempt {index}: ECHO LOST")
            return False


async def main():
    results = [await attempt(i) for i in range(ATTEMPTS)]
    passed = sum(results)
    print(f"\n{passed}/{ATTEMPTS} echoed")
    sys.exit(0 if passed == ATTEMPTS else 1)


asyncio.run(main())
