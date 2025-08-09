import eventlet
eventlet.monkey_patch()

import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

app = Flask(__name__)
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

@app.route('/')
def index():
    return {'message': 'Test API', 'status': 'running'}, 200

@app.route('/health')
def health():
    return "OK", 200

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting test server on 0.0.0.0:{port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
