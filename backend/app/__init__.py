import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Configure SocketIO for production
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=False,
    engineio_logger=False
)

def create_app():
    app = Flask(__name__)
    
    # Configure CORS for production
    CORS(app, resources={
        r"/*": {
            "origins": ["https://your-vercel-app.vercel.app", "*"],
            "methods": ["GET", "POST"],
            "allow_headers": ["Content-Type"]
        }
    })
    
    # Initialize SocketIO with the app
    socketio.init_app(app)

    # Add a root route to fix the 404 error
    @app.route('/')
    def index():
        return {'message': 'Learning Companion API', 'status': 'running'}, 200

    # Import and register your routes
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app