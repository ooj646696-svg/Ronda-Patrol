#!/usr/bin/env python
"""
Simple WebSocket connection test
"""
import asyncio
import websockets
import json

async def test_websocket():
    try:
        # Test WebSocket connection
        uri = "ws://localhost:8000/ws/live-gps/?token=test-token"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("WebSocket connected!")
            
            # Send a ping message
            await websocket.send(json.dumps({"type": "ping"}))
            
            # Wait for response
            response = await websocket.recv()
            print(f"Received: {response}")
            
    except Exception as e:
        print(f"WebSocket test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
