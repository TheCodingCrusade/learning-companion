import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Configure SocketIO for production
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,  # Enable logging for debugging
    engineio_logger=True  # Enable engine.io logging
)

def create_app():
    app = Flask(__name__)
    
    # Configure CORS for production
    CORS(app, resources={
        r"/*": {
            "origins": ["https://learning-companion-chi.vercel.app", "*"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })
    
    # Initialize SocketIO with the app
    socketio.init_app(app, cors_allowed_origins="*")

    # Add a root route to fix the 404 error
    @app.route('/')
    def index():
        return {'message': 'Learning Companion API', 'status': 'running'}, 200

    # Import and register your routes
    try:
        from .routes import main_bp
        app.register_blueprint(main_bp)
    except ImportError as e:
        print(f"Error importing routes: {e}")
        
    return app