import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Create the SocketIO instance globally
socketio = SocketIO()

def create_app():
    app = Flask(__name__)
    
    # Configure CORS for all routes including Socket.IO
    CORS(app, 
         origins=["https://learning-companion-chi.vercel.app", "http://localhost:3000"],
         methods=["GET", "POST", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=True)
    
    # Initialize SocketIO with the app and CORS settings
    socketio.init_app(app, 
                      cors_allowed_origins=["https://learning-companion-chi.vercel.app", "http://localhost:3000"],
                      async_mode='eventlet',
                      logger=False,
                      engineio_logger=False)

    # Add a root route
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