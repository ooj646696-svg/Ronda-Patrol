#!/usr/bin/env python
import requests
import json

def test_backend_connection():
    """Test if backend is accessible and working"""
    base_url = "http://192.168.1.10:8000/api"
    
    print(f"🔍 Testing backend connection to: {base_url}")
    
    try:
        # Test basic API endpoint
        response = requests.get(f"{base_url}/sessions/", timeout=5)
        print(f"✅ Backend accessible! Status: {response.status_code}")
        
        # Test GPS endpoint (should fail without auth, but should reach the server)
        response = requests.post(f"{base_url}/gps-logs/", 
                               json={"test": "data"}, 
                               timeout=5)
        print(f"✅ GPS endpoint reachable! Status: {response.status_code}")
        
    except requests.exceptions.ConnectionError:
        print("❌ Backend not accessible - Connection refused")
        print("   Make sure the backend server is running on 192.168.1.10:8000")
    except requests.exceptions.Timeout:
        print("❌ Backend timeout - Server is too slow or not responding")
    except Exception as e:
        print(f"❌ Backend test failed: {e}")

if __name__ == '__main__':
    test_backend_connection()
