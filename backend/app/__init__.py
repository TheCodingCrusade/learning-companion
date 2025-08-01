# --- DEBUGGING VERSION ---

import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_socketio import SocketIO

# Use the simplest possible configuration for debugging
socketio = SocketIO(
    async_mode='eventlet',
    cors_allowed_origins="*"  # Allow all origins for this test
)

def create_app():
    app = Flask(__name__)
    
    # We are temporarily removing CORS and ProxyFix from the app itself
    
    socketio.init_app(app)

    # Import and register the blueprint
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app